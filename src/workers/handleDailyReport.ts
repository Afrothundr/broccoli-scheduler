import {
  ItemStatusType,
  type Item,
  type ItemType,
  type User,
} from "@prisma/client";
import type { Job } from "bullmq";
import dayjs from "dayjs";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import localizedFormat from "dayjs/plugin/localizedFormat";
import mjml2html from "mjml";
import { Resend } from "resend";
import { jobTypes, type WorkerJob } from "../jobs";
import prisma from "../repository/prisma";
import type {
  RecipeInformation,
  RecipeResponse,
  UserPreferences,
} from "../types";
import logger from "../utils/logger";
import calculateTotalSavings from "../utils/totalSavings";
import calculateUsageRate from "../utils/usageRate";

const resend = new Resend(process.env.RESEND_KEY);

dayjs.extend(isSameOrBefore);
dayjs.extend(localizedFormat);

type CombinedItem = Item & { itemTypes: ItemType[] };

const handleDailyReport = async (job: Job<WorkerJob>) => {
  switch (job.data.type) {
    case jobTypes.DAILY_REPORTER: {
      const { id } = job.data.data;
      try {
        logger.info(`Compiling daily report for user: ${id}`);

        const user = await prisma.user.findUniqueOrThrow({
          where: { id },
          include: {
            items: {
              include: {
                itemTypes: true,
              },
              where: {
                status: {
                  in: [
                    ItemStatusType.FRESH,
                    ItemStatusType.OLD,
                    ItemStatusType.BAD,
                  ],
                },
                itemTypes: {
                  none: {
                    name: {
                      in: ["Frozen food", "Non-perishable"],
                    },
                  },
                },
              },
            },
          },
        });
        const groceryTrips = await prisma.user.findUniqueOrThrow({
          where: { id },
          include: {
            groceryTrips: {
              include: {
                items: true,
              },
            },
          },
        });
        const preferences = user.preferences ?? ({} as UserPreferences);
        logger.info(`User preferences: ${JSON.stringify(preferences)}`);

        const usageRate = calculateUsageRate(groceryTrips.groceryTrips);
        const totalSavings = calculateTotalSavings(groceryTrips.groceryTrips);

        const { itemsAtRisk, itemsToRemove, eatTheseFirst } =
          calculateItemsAtRisk(user);

        if ([itemsToRemove, eatTheseFirst].every((list) => list.length === 0)) {
          logger.info(`Skipping daily update for user: ${id}`);
          return;
        }
        if (process.env.NODE_ENV === "local") {
          logger.info(`Skipping daily update for user: ${id}`);
          return;
        }
        const response = eatTheseFirst.length
          ? await fetch(
              `https://api.spoonacular.com/recipes/findByIngredients?ingredients=${encodeURI(
                [...eatTheseFirst.slice(0, 3), ...itemsToRemove.slice(0, 3)]
                  .map((item) => item.itemTypes[0].name)
                  .join(", "),
              )}&number=1&apiKey=${process.env.SPOONTACULAR_KEY}`,
            )
          : null;

        const recipes = response?.ok
          ? ((await response?.json()) as RecipeResponse[])
          : null;

        const recipe = recipes?.[0];
        const recipeFullResponse = await fetch(
          `https://api.spoonacular.com/recipes/${recipe?.id}/information&apiKey=${process.env.SPOONTACULAR_KEY}`,
        );
        const recipeFull = recipeFullResponse.ok
          ? ((await recipeFullResponse?.json()) as RecipeInformation)
          : null;
        const { error } = await resend.emails.send({
          from: "Broccoli Daily Updates <hello@getbroccoli.app>",
          to: [user.email],
          subject: `Pantry Report for ${dayjs().format("LL")}`,
          html: constructEmail({
            itemsAtRisk,
            itemsToRemove,
            eatTheseFirst,
            usageRate,
            totalSavings,
            recipe,
            recipeFull,
          }).html,
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

function calculateItemsAtRisk(user: User & { items: CombinedItem[] }) {
  const itemsAtRisk = user.items.filter(
    (item) => item.status !== ItemStatusType.BAD,
  );
  const itemsToRemove = user.items.filter(
    (item) => item.status === ItemStatusType.BAD,
  );
  const eatTheseFirst = itemsAtRisk.sort((a, b) => {
    const itemTypeA = a.itemTypes[0];
    const itemTypeB = b.itemTypes[0];
    const expirationDateA = dayjs(itemTypeA.createdAt).add(
      itemTypeA.suggested_life_span_seconds,
      "seconds",
    );
    const expirationDateB = dayjs(itemTypeB.createdAt).add(
      itemTypeB.suggested_life_span_seconds,
      "seconds",
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
  usageRate = 0,
  totalSavings = 0,
  recipe,
  recipeFull,
}: {
  itemsAtRisk: CombinedItem[];
  itemsToRemove: CombinedItem[];
  eatTheseFirst: CombinedItem[];
  usageRate: number | null;
  totalSavings: number | null;
  recipe?: RecipeResponse | null;
  recipeFull?: RecipeInformation | null;
}) {
  const formattedEatTheseFirstBlocks = eatTheseFirst.slice(0, 3).map(
    (item) => `
       <mj-column padding="5px">
        <mj-wrapper css-class="product-card" padding="0" background-color="#f5f5f5">
          <mj-section padding="0">
            <mj-column>
              <mj-image src="https://placehold.co/300x180/8BC34A/FFFFFF?text=${encodeURI(
                item.itemTypes[0].name,
              )}" padding="0" />
            </mj-column>
          </mj-section>
          <mj-section padding="15px">
            <mj-column>
              <mj-text font-weight="700" font-size="18px" padding="0 0 10px">
              ${item.name}
              </mj-text>
              <mj-text padding="0 0 5px">
                <strong>How much is left?</strong><br />
                <span class="expiry-ok">${100 - item.percentConsumed}%</span>
              </mj-text>
              <mj-text padding="0">
                <strong>Storage Advice:</strong><br />
                ${item.itemTypes[0].storage_advice}
              </mj-text>
            </mj-column>
          </mj-section>
        </mj-wrapper>
      </mj-column>
    `,
  );

  const formattedItemsToRemoveBlocks = itemsToRemove.slice(0, 3).map(
    (item) => `
       <mj-column padding="5px">
        <mj-wrapper css-class="product-card" padding="0" background-color="#f5f5f5">
          <mj-section padding="0">
            <mj-column>
              <mj-image src="https://placehold.co/300x180/c3824a/FFFFFF?text=${encodeURI(
                item.itemTypes[0].name,
              )}" padding="0" />
            </mj-column>
          </mj-section>
          <mj-section padding="15px">
            <mj-column>
              <mj-text font-weight="700" font-size="18px" padding="0 0 10px">
              ${item.name}
              </mj-text>
              <mj-text padding="0 0 5px">
                <strong>How much is left?</strong><br />
                <span class="expiry-ok">${100 - item.percentConsumed}%</span>
              </mj-text>
              <mj-text padding="0">
                <strong>Storage Advice:</strong><br />
                ${item.itemTypes[0].storage_advice}
              </mj-text>
            </mj-column>
          </mj-section>
        </mj-wrapper>
      </mj-column>
    `,
  );
  return mjml2html(`
<mjml>
  <mj-head>
    <mj-title>Broccoli Daily Pantry Report</mj-title>
    <mj-font name="Roboto" href="https://fonts.googleapis.com/css?family=Roboto:300,400,500,700" />
    <mj-attributes>
      <mj-all font-family="Roboto, Arial, sans-serif" />
      <mj-text font-weight="400" font-size="16px" color="#333333" line-height="24px" />
      <mj-section padding="10px 0" />
    </mj-attributes>
    <mj-style>
      .product-card {
        border-radius: 8px;
        overflow: hidden;
      }
      .expiry-warning {
        color: #e74c3c;
        font-weight: bold;
      }
      .expiry-ok {
        color: #27ae60;
        font-weight: bold;
      }
      .heading-text {
        color: #666;
        font-size: 28px;
      }
      .product-title {
        font-weight: 500;
      }
    </mj-style>
  </mj-head>

  <mj-body background-color="#f9f9f9">
    <!-- Header -->
    <mj-section background-color="#ffffff" padding="20px 0">
      <mj-column>
        <mj-image src="https://getbroccoli.app/logo.png" alt="Broccoli Logo" width="200px" padding="10px 0" />
        <mj-text align="center" color="#666666" font-size="32px" font-weight="300" padding="10px 0">
          Daily Pantry Report
        </mj-text>
      </mj-column>
    </mj-section>

    <!-- Hero Image -->
        <mj-hero
      mode="fluid-height"
      background-width="600px"
      background-height="200px"
      background-url=
          "https://images.unsplash.com/photo-1576181456177-2b99ac0aa1ef?q=80"
      background-color="#2a3448"
      padding="100px 0px">
    </mj-hero>

    <!-- Main Heading -->
     ${
       splitIntoGroupsOfThree(formattedEatTheseFirstBlocks).length
         ? ` <mj-section background-color="#ffffff" padding="30px 0 10px">
      <mj-column>
        <mj-text align="center" css-class="heading-text" font-size="28px" padding="0 20px">
          Heading to the kitchen?
        </mj-text>
        <mj-text align="center" font-size="20px" padding="10px 20px 20px">
          Eat these things first
        </mj-text>
        <mj-image src="https://placehold.co/50x50/95A5A6/FFFFFF?text=↓" width="50px" padding="0 0 20px" />
      </mj-column>
    </mj-section>

    <!-- Products Grid -->
    <mj-section background-color="#ffffff">
          ${splitIntoGroupsOfThree(formattedEatTheseFirstBlocks).map(
            (items) => {
              return `<mj-section padding="20px 0">${items.join(
                " ",
              )}</mj-section>`;
            },
          )}
    </mj-section>`
         : ""
     }

          ${
            splitIntoGroupsOfThree(formattedItemsToRemoveBlocks).length
              ? ` <mj-section background-color="#ffffff" padding="30px 0 10px">
      <mj-column>
        <mj-text align="center" css-class="heading-text" font-size="28px" padding="0 20px">
          Might be that time...
        </mj-text>
        <mj-text align="center" font-size="20px" padding="10px 20px 20px">
          See if you can save these items
        </mj-text>
        <mj-image src="https://placehold.co/50x50/95A5A6/FFFFFF?text=↓" width="50px" padding="0 0 20px" />
      </mj-column>
    </mj-section>

    <!-- Products Grid -->
    <mj-section background-color="#ffffff">
          ${splitIntoGroupsOfThree(formattedItemsToRemoveBlocks).map(
            (items) => {
              return `<mj-section padding="20px 0">${items.join(
                " ",
              )}</mj-section>`;
            },
          )}
    </mj-section>`
              : ""
          }

     <mj-section>
      <mj-column>
           <mj-button background-color="#5c9841" href="getbroccoli.app/items">View your inventory</mj-button>
      </mj-column>
    </mj-section>

    <!-- Usage Tips -->
    ${
      recipe
        ? `    <mj-section background-color="#8BC34A" padding="20px 0">
      <mj-column>
        <mj-text color="#ffffff" font-size="20px" align="center" font-weight="500">
          This Week's Recipe Idea
        </mj-text>
        <mj-text color="#ffffff" align="center">
          Use your ${recipe.usedIngredients
            .map((ingredient) => ingredient.name)
            .join(", ")
            .replace(/, ([^,]*)$/, " and $1")} to create a delicious ${
            recipe.title
          }!
        </mj-text>
        ${
          recipeFull
            ? `<mj-button background-color="#ffffff" color="#8BC34A" font-weight="500" border-radius="4px" href="${recipeFull.sourceUrl}">
          VIEW RECIPE
        </mj-button>`
            : ""
        }
      </mj-column>
    </mj-section>`
        : ""
    }


    <!-- Food Waste Stats -->
    <mj-section background-color="#ffffff" padding="30px 0">
      <mj-column width="100%">
        <mj-text align="center" font-size="20px" font-weight="500" padding="0 20px 15px">
          Your Pantry Stats
        </mj-text>
      </mj-column>
      <mj-column width="50%" padding-bottom="10px" >
        <mj-text align="center" font-size="36px" font-weight="700" color="#8BC34A" padding="0">
          ${usageRate}%
        </mj-text>
        <mj-text align="center" padding="5px 0 0">
          Usage Rate
        </mj-text>
      </mj-column>
      <mj-column width="50%" padding-bottom="10px">
        <mj-text align="center" font-size="36px" font-weight="700" color="#8BC34A" padding="0">
         $${totalSavings}
        </mj-text>
        <mj-text align="center" padding="5px 0 0">
          Total Savings
        </mj-text>
      </mj-column>
    </mj-section>

    <!-- Footer -->
    <mj-section background-color="#f5f5f5" padding="20px 0">
      <mj-column>
        <mj-text align="center" color="#666666" font-size="12px" line-height="18px">
          © 2025 Broccoli. All rights reserved.<br />
          You're receiving this email because you signed up for pantry tracking.
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
`);
}

function splitIntoGroupsOfThree<T>(arr: T[]) {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += 3) {
    result.push(arr.slice(i, i + 3));
  }
  return result;
}

export default handleDailyReport;
