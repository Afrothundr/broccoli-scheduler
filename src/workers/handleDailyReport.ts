import {
  type Item,
  ItemStatusType,
  type ItemType,
  type User,
} from "@prisma/client";
import type { Job } from "bullmq";
import { type WorkerJob, jobTypes } from "../jobs";
import prisma from "../repository/prisma";
import dayjs from "dayjs";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import localizedFormat from "dayjs/plugin/localizedFormat";
import mjml2html from "mjml";
import { Resend } from "resend";
import logger from "../utils/logger";

const resend = new Resend(process.env.RESEND_KEY);

dayjs.extend(isSameOrBefore);
dayjs.extend(localizedFormat);

type CombinedItem = Item & { ItemType: ItemType[] };

const handleDailyReport = async (job: Job<WorkerJob>) => {
  switch (job.data.type) {
    case jobTypes.DAILY_REPORTER: {
      const { id } = job.data.data;
      try {
        logger.info(`Compiling daily report for user: ${id}`);
        const user = await prisma.user.findUniqueOrThrow({
          where: { id },
          include: {
            Item: {
              include: {
                ItemType: true,
              },
              where: {
                status: {
                  in: [
                    ItemStatusType.FRESH,
                    ItemStatusType.OLD,
                    ItemStatusType.BAD,
                  ],
                },
              },
            },
          },
        });

        const { itemsAtRisk, itemsToRemove, eatTheseFirst } =
          calculateItemsAtRisk(user);

        if ([itemsToRemove, eatTheseFirst].every((list) => list.length === 0)) {
          logger.info(`Skipping daily update for user: ${id}`);
          return;
        }

        const { data, error } = await resend.emails.send({
          from: "Broccoli Daily Updates <hello@getbroccoli.app>",
          to: [user.email],
          subject: `Pantry Report for ${dayjs().format("LL")}`,
          html: constructEmail({ itemsAtRisk, itemsToRemove, eatTheseFirst })
            .html,
        });

        if (error) {
          return logger.error({ error });
        }

        logger.info(`Finished compiling report for user: ${id}`);
      } catch (err) {
        logger.error(`Problem updating item: ${err}`);
      }
      return;
    }
  }
};

function calculateItemsAtRisk(user: User & { Item: CombinedItem[] }) {
  const itemsAtRisk = user.Item.filter(
    (item) => item.status !== ItemStatusType.BAD
  );
  const itemsToRemove = user.Item.filter(
    (item) => item.status === ItemStatusType.BAD
  );
  const eatTheseFirst = itemsAtRisk.sort((a, b) => {
    const itemTypeA = a.ItemType[0];
    const itemTypeB = b.ItemType[0];
    const expirationDateA = dayjs(itemTypeA.createdAt).add(
      itemTypeA.suggested_life_span_seconds,
      "seconds"
    );
    const expirationDateB = dayjs(itemTypeB.createdAt).add(
      itemTypeB.suggested_life_span_seconds,
      "seconds"
    );
    if (expirationDateA.isSameOrBefore(expirationDateB)) {
      return -1;
    }

    return 1;
  });
  return { itemsAtRisk, itemsToRemove, eatTheseFirst };
}

function constructEmail({
  itemsAtRisk,
  itemsToRemove,
  eatTheseFirst,
}: {
  itemsAtRisk: CombinedItem[];
  itemsToRemove: CombinedItem[];
  eatTheseFirst: CombinedItem[];
}) {
  const formattedEatTheseFirstBlocks = eatTheseFirst.slice(0, 6).map(
    (item) => `
          <mj-column>
        <mj-text font-style="italic" font-size="20px" font-family="Helvetica Neue" color="#626262">${
          item.name
        }</mj-text>
        <mj-text>How much is left? ${100 - item.percentConsumed}%</mj-text>
        <mj-text color="#525252">
         <mj-text font-style="italic" font-size="16px" font-family="Helvetica Neue" color="#626262">Storage Advice:</mj-text>
        <mj-text color="#525252">${item.ItemType[0].storage_advice}</mj-text>
      </mj-column>
    `
  );

  const formattedItemsToRemoveBlocks = itemsToRemove.slice(0, 6).map(
    (item) => `
          <mj-column>
        <mj-text font-style="italic" font-size="20px" font-family="Helvetica Neue" color="#626262">${
          item.name
        }</mj-text>
        <mj-text>How much is left? ${100 - item.percentConsumed}%</mj-text>
        <mj-text color="#525252">
         <mj-text font-style="italic" font-size="16px" font-family="Helvetica Neue" color="#626262">Storage Advice:</mj-text>
        <mj-text color="#525252">${item.ItemType[0].storage_advice}</mj-text>
      </mj-column>
    `
  );
  return mjml2html(`
<mjml>
  <mj-body>
    <mj-section background-color="#f0f0f0">
      <mj-column>
        <mj-image src="https://getbroccoli.app/logo.png" width="200px" />
        <mj-text font-family="Helvetica Neue" font-size="28px" color="#626262" align="center">Daily Pantry Report</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-url="https://images.unsplash.com/photo-1576181456177-2b99ac0aa1ef?q=80&w=700&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" background-size="cover" background-repeat="no-repeat">
      <mj-column width="600px" padding-bottom="150px">
      </mj-column>
    </mj-section>
    <mj-section background-color="#fafafa">
      <mj-column width="400px">
        <mj-text font-style="italic" font-size="20px" font-family="Helvetica Neue" color="#626262" align="center">Heading to the kitchen?</mj-text>
        <mj-text color="#525252" align="center">Eat these things first</mj-text>
        <mj-text color="#525252" align="center" font-size="25px">⬇</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="white">
    ${splitIntoGroupsOfThree(formattedEatTheseFirstBlocks).map((items) => {
      return `<mj-section>${items.join(" ")}</mj-section>`;
    })}
      })}
    </mj-section>
    ${(() => {
      if (formattedItemsToRemoveBlocks.length > 0) {
        return `<mj-section background-color="#fafafa">
      <mj-column width="400px">
        <mj-text font-style="italic" font-size="20px" font-family="Helvetica Neue" color="#626262" align="center">Better luck next time!</mj-text>
        <mj-text color="#525252" align="center">Consider composting or removing these things</mj-text>
        <mj-text color="#525252" align="center" font-size="25px">👋🏼</mj-text>
      </mj-column>
    </mj-section>
    <mj-section background-color="white">
         ${splitIntoGroupsOfThree(formattedItemsToRemoveBlocks).map((items) => {
           return `<mj-section>${items.join(" ")}</mj-section>`;
         })}
    </mj-section>`;
      }
      return "";
    })()}
    <mj-section background-color="#fafafa">
      <mj-column width="400px">
        <mj-text align="center" font-size="16px" font-family="Helvetica Neue" color="#626262" align="center">You have been doing great!</mj-text>
        <mj-text align="center" font-size="24px" font-family="Helvetica Neue" color="#626262" align="center">Let's keep the momentum going</mj-text>
        <mj-button background-color="#5c9841" href="getbroccoli.app/items">View your inventory</mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`);
}

function splitIntoGroupsOfThree<T>(arr: T[]) {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += 3) {
    result.push(arr.slice(i, i + 3));
  }
  return result;
}

export default handleDailyReport;
