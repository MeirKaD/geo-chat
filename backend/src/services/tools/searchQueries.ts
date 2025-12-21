import { tool } from "@langchain/core/tools";
import { z } from "zod";

import {
  SUPPORTED_CATEGORIES,
  buildSearchQueriesForTool,
  type QueryToolInput,
  type QueryToolOutput,
} from "./queryBuilder.js";

const filtersSchema = z.object({
  query: z.string().optional(),
  beds: z.number().int().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  cuisine: z.string().optional(),
  features: z.array(z.string()).optional(),
  dates: z.string().optional(),
  specialty: z.string().optional(),
  budgetPerNight: z.number().min(0).optional(),
  starRating: z.number().min(0).max(5).optional(),
  guests: z.number().int().min(1).optional(),
});

const inputSchema = z.object({
  category: z.enum([...SUPPORTED_CATEGORIES]),
  location: z.string(),
  filters: filtersSchema.optional(),
});

export const searchQueryTool = tool(
  async (input: QueryToolInput): Promise<QueryToolOutput> => {
    const queries = buildSearchQueriesForTool(input);
    return { queries };
  },
  {
    name: "build_search_queries",
    description:
      "Generate optimized Google search queries (with site scopes) for the user's intent and location. Use this before calling web search tools.",
    schema: inputSchema,
  }
);
