import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import { fal } from "@fal-ai/client";

dotenv.config();

const client = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

fal.config({
  credentials: process.env.FAL_KEY,
});

const tools = [
  {
    name: "create_object",
    description:
      "Create a 3D object (sphere, cube, cylinder, cone) at a position",
    input_schema: {
      type: "object",
      properties: {
        shape: {
          type: "string",
          enum: ["sphere", "cube", "cylinder", "cone"],
          description: "The 3D shape to create",
        },
        x: {
          type: "number",
          description: "X position (-10 to 10)",
        },
        y: {
          type: "number",
          description: "Y position (-10 to 10)",
        },
        z: {
          type: "number",
          description: "Z position (-10 to 10)",
        },
        size: {
          type: "number",
          description: "Size scale (0.5 to 5)",
        },
        color: {
          type: "string",
          description: 'Color in hex (e.g., "#FF0000" for red)',
        },
      },
      required: ["shape", "x", "y", "z"],
    },
  },
  {
    name: "move_object",
    description: "Move an object to a new position",
    input_schema: {
      type: "object",
      properties: {
        object_id: {
          type: "string",
          description: "Unique ID of the object",
        },
        x: { type: "number" },
        y: { type: "number" },
        z: { type: "number" },
      },
      required: ["object_id", "x", "y", "z"],
    },
  },
  {
    name: "rotate_object",
    description:
      "Rotate an object BY the given number of degrees (relative to its current rotation; omit or use 0 for axes that shouldn't change). The viewer looks at the scene from the front. Turn/spin left = positive ry, turn/spin right or clockwise (seen from above) = negative ry. Tip/tilt forward (top toward the viewer) = positive rx, tilt back = negative rx. Roll/lean left = positive rz, lean right = negative rz. If no amount is given, use 45 degrees. Upside down = 180 degrees around rx.",
    input_schema: {
      type: "object",
      properties: {
        object_id: { type: "string" },
        rx: { type: "number", description: "Degrees to tilt forward (+) / back (-)" },
        ry: { type: "number", description: "Degrees to turn left (+) / right (-) around the vertical axis" },
        rz: { type: "number", description: "Degrees to roll/lean left (+) / right (-)" },
      },
      required: ["object_id"],
    },
  },
  {
    name: "scale_object",
    description: "Scale an object to a new size",
    input_schema: {
      type: "object",
      properties: {
        object_id: { type: "string" },
        scale: { type: "number", description: "Scale factor (0.1 to 10)" },
      },
      required: ["object_id", "scale"],
    },
  },
  {
    name: "delete_object",
    description: "Delete an object from the scene",
    input_schema: {
      type: "object",
      properties: {
        object_id: { type: "string" },
      },
      required: ["object_id"],
    },
  },
  {
    name: "change_color",
    description: "Change the color of an object",
    input_schema: {
      type: "object",
      properties: {
        object_id: { type: "string" },
        color: { type: "string", description: "Color in hex (e.g., #FF0000)" },
      },
      required: ["object_id", "color"],
    },
  },
  {
    name: "generate_model",
    description:
      "Generate a custom 3D model from a text description when the user wants something that isn't a basic sphere/cube/cylinder/cone (e.g. 'make me a chess piece', 'generate a dragon', 'create a coffee mug'). This takes longer than creating a basic shape, so only use it when a basic shape clearly won't do.",
    input_schema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "A clear, descriptive text prompt of what to generate",
        },
        x: { type: "number", description: "X position (-10 to 10)" },
        y: { type: "number", description: "Y position (-10 to 10)" },
        z: { type: "number", description: "Z position (-10 to 10)" },
        size: { type: "number", description: "Size scale (0.5 to 5)" },
      },
      required: ["prompt", "x", "y", "z"],
    },
  },
];

const systemPrompt = `You are a 3D modeling assistant helping users create and manipulate 3D scenes using hand gestures and voice commands.

When the user wants to create or modify 3D objects, use the provided tools to execute their requests. 

Guidelines:
- Create objects at reasonable positions (between -5 and 5 on each axis for visibility)
- Default size is 1.0 unless specified
- Default colors: sphere=blue (#0000FF), cube=red (#FF0000), cylinder=green (#00FF00), cone=yellow (#FFFF00)
- Be creative with positioning but keep objects visible
- Acknowledge what you're doing before calling tools
- For multiple operations, call tools sequentially
- If user describes hand gestures, infer intent (e.g., "opening hand" = create object)
- Use create_object only for basic primitives (sphere, cube, cylinder, cone). For anything more specific or complex (an animal, a tool, a named object), use generate_model instead with a clear descriptive prompt`;

async function runGeneration(prompt) {
  const result = await fal.subscribe("fal-ai/hyper3d/rodin/v2.5/text-to-3d", {
    input: {
      prompt,
      geometry_file_format: "glb",
    },
    logs: false,
  });
  return result.data.model_mesh.url;
}

export async function chat(userMessage, conversationHistory = [], scene = []) {
  const messages = [
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  const sceneContext = scene.length > 0
    ? `\n\nCurrent scene objects:\n${JSON.stringify(scene, null, 2)}\n\nWhen the user refers to an existing object ("the red cube", "it", "that sphere"), find its matching object_id from this list and use that exact id. "it"/"this"/"that" with no other description means the object marked "selected": true; rotation values are in degrees. Use that exact id in move_object/rotate_object/scale_object/delete_object/change_color calls. Never invent an object_id.`
    : "\n\nThe scene is currently empty.";

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: systemPrompt + sceneContext,
    tools,
    messages,
  });

  const toolCalls = [];

  for (const block of response.content) {
    if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: block.input,
      });
    }
  }

  // generate_model needs an actual async call to Fal before the frontend can use it,
  // so we run it here and attach the resulting model URL to the tool call's input.
  for (const call of toolCalls) {
    if (call.name === "generate_model") {
      try {
        const modelUrl = await runGeneration(call.input.prompt);
        call.input.modelUrl = modelUrl;
      } catch (err) {
        console.error("Fal generation failed:", err);
        call.input.error = "Generation failed, please try again.";
      }
    }
  }

  return {
    toolCalls,
    message:
      response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("") || "",
    stopReason: response.stop_reason,
  };
}