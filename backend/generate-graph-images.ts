/**
 * Generate PNG visualizations of the LangGraph pipelines
 *
 * Run with: npx tsx generate-graph-images.ts
 */

import * as fs from "node:fs/promises";
import { getFastPipelineGraph } from "./src/services/langgraph/fastPipelineGraph.js";
import { getPipelineGraph } from "./src/services/langgraph/pipelineGraph.js";

async function generateGraphImages() {
  console.log("Generating graph visualizations...\n");

  // Generate Fast Pipeline Graph
  console.log("1. Generating Fast Pipeline Graph...");
  const fastGraph = getFastPipelineGraph();
  const fastDrawable = await fastGraph.getGraphAsync();
  const fastImage = await fastDrawable.drawMermaidPng();
  const fastImageBuffer = new Uint8Array(await fastImage.arrayBuffer());
  await fs.writeFile("fast-pipeline-graph.png", fastImageBuffer);
  console.log("   ✓ Saved to fast-pipeline-graph.png\n");

  // Generate Deep Pipeline Graph
  console.log("2. Generating Deep Pipeline Graph...");
  const deepGraph = getPipelineGraph();
  const deepDrawable = await deepGraph.getGraphAsync();
  const deepImage = await deepDrawable.drawMermaidPng();
  const deepImageBuffer = new Uint8Array(await deepImage.arrayBuffer());
  await fs.writeFile("deep-pipeline-graph.png", deepImageBuffer);
  console.log("   ✓ Saved to deep-pipeline-graph.png\n");

  console.log("Done! Graph images generated successfully.");
}

generateGraphImages().catch(console.error);
