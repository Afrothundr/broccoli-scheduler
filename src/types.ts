export enum QUEUE_TYPES {
  ITEM_UPDATER = "itemUpdater",
  IMAGE_PROCESSOR = "imageProcessor",
  DAILY_REPORTER = "dailyReporter",
}

export type RecipeResponse = {
  id: number;
  image: string;
  imageType: string;
  likes: number;
  missedIngredientCount: number;
  missedIngredients: SearchRecipesByIngredients200ResponseInnerMissedIngredientsInner[];
  title: string;
  unusedIngredients: Array<unknown>;
  usedIngredientCount: number;
  usedIngredients: SearchRecipesByIngredients200ResponseInnerMissedIngredientsInner[];
};

type SearchRecipesByIngredients200ResponseInnerMissedIngredientsInner = {
  aisle: string;
  amount: number;
  id: number;
  image: string;
  meta?: Array<string>;
  name: string;
  extendedName?: string;
  original: string;
  originalName: string;
  unit: string;
  unitLong: string;
  unitShort: string;
};

export type RecipeInformation = {
  id: number;
  title: string;
  image: string | null;
  imageType?: string;
  servings: number;
  readyInMinutes: number;
  preparationMinutes?: number | null;
  cookingMinutes?: number | null;
  license?: string;
  sourceName: string;
  sourceUrl: string;
  spoonacularSourceUrl: string;
  aggregateLikes: number;
  healthScore: number;
  spoonacularScore: number;
  pricePerServing: number;
  cheap: boolean;
  creditsText: string;
  cuisines: Array<string>;
  dairyFree: boolean;
  diets: Array<string>;
  gaps: string;
  glutenFree: boolean;
  instructions: string | null;
  lowFodmap: boolean;
  occasions: Array<string>;
  sustainable: boolean;
  vegan: boolean;
  vegetarian: boolean;
  veryHealthy: boolean;
  veryPopular: boolean;
  weightWatcherSmartPoints: number;
  dishTypes: Array<string>;
};
