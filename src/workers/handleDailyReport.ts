import { Item, ItemStatusType, ItemType, User } from "@prisma/client";
import { Job } from "bullmq";
import { WorkerJob, jobTypes } from "../jobs";
import prisma from "../repository/prisma";
import dayjs from "dayjs";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import mjml2html from "mjml";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_KEY);

dayjs.extend(isSameOrBefore);

const handleDailyReport = async (job: Job<WorkerJob>) => {
  switch (job.data.type) {
    case jobTypes.DAILY_REPORTER: {
      const { id } = job.data.data;
      try {
        console.log(`Compiling daily report for user: ${id}`);
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
        console.log({ itemsAtRisk, itemsToRemove, eatTheseFirst });
        const { data, error } = await resend.emails.send({
          from: "Acme <onboarding@resend.dev>",
          to: ["branford.harris@outlook.com"],
          subject: "Hello World",
          html: constructEmail().html,
        });

        if (error) {
          return console.error({ error });
        }

        console.log({ data });
        console.log(`Finished compiling report for user: ${id}`);
      } catch (err) {
        console.error(`Problem updating item: ${err}`);
      }
      return;
    }
  }
};

function calculateItemsAtRisk(
  user: User & { Item: (Item & { ItemType: ItemType[] })[] }
) {
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

function constructEmail() {
  return mjml2html(`
  <mjml>
  <mj-body>
    <mj-raw>
      <!-- Company Header -->
    </mj-raw>
    <mj-section background-color="#f0f0f0">
      <mj-column>
        <mj-text font-style="italic" font-size="20px" color="#626262">My Company</mj-text>
      </mj-column>
    </mj-section>
    <mj-raw>
      <!-- Image Header -->
    </mj-raw>
    <mj-section background-url="http://1.bp.blogspot.com/-TPrfhxbYpDY/Uh3Refzk02I/AAAAAAAALw8/5sUJ0UUGYuw/s1600/New+York+in+The+1960's+-+70's+(2).jpg" background-size="cover" background-repeat="no-repeat">
      <mj-column width="600px">
        <mj-text align="center" color="#fff" font-size="40px" font-family="Helvetica Neue">Slogan here</mj-text>
        <mj-button background-color="#F63A4D" href="#">Promotion</mj-button>
      </mj-column>
    </mj-section>
    <mj-raw>
      <!-- Intro text -->
    </mj-raw>
    <mj-section background-color="#fafafa">
      <mj-column width="400px">
        <mj-text font-style="italic" font-size="20px" font-family="Helvetica Neue" color="#626262">My Awesome Text</mj-text>
        <mj-text color="#525252">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin rutrum enim eget magna efficitur, eu semper augue semper. Aliquam erat volutpat. Cras id dui lectus. Vestibulum sed finibus lectus, sit amet suscipit nibh. Proin nec commodo purus.
          Sed eget nulla elit. Nulla aliquet mollis faucibus.</mj-text>
        <mj-button background-color="#F45E43" href="#">Learn more</mj-button>
      </mj-column>
    </mj-section>
    <mj-raw>
      <!-- Side image -->
    </mj-raw>
    <mj-section background-color="white">
      <mj-raw>
        <!-- Left image -->
      </mj-raw>
      <mj-column>
        <mj-image width="200px" src="https://designspell.files.wordpress.com/2012/01/sciolino-paris-bw.jpg"></mj-image>
      </mj-column>
      <mj-raw>
        <!-- right paragraph -->
      </mj-raw>
      <mj-column>
        <mj-text font-style="italic" font-size="20px" font-family="Helvetica Neue" color="#626262">Find amazing places</mj-text>
        <mj-text color="#525252">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Proin rutrum enim eget magna efficitur, eu semper augue semper. Aliquam erat volutpat. Cras id dui lectus. Vestibulum sed finibus lectus.</mj-text>
      </mj-column>
    </mj-section>
    <mj-raw>
      <!-- Icons -->
    </mj-raw>
    <mj-section background-color="#fbfbfb">
      <mj-column>
        <mj-image width="100px" src="http://191n.mj.am/img/191n/3s/x0l.png"></mj-image>
      </mj-column>
      <mj-column>
        <mj-image width="100px" src="http://191n.mj.am/img/191n/3s/x01.png"></mj-image>
      </mj-column>
      <mj-column>
        <mj-image width="100px" src="http://191n.mj.am/img/191n/3s/x0s.png"></mj-image>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`);
}

export default handleDailyReport;
