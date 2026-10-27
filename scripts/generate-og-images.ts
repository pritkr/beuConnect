import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateOpenGraphImage } from "astro-og-canvas";
import {
	OG_PAGE_CONFIG,
	OG_IMAGE_HEIGHT,
	OG_IMAGE_WIDTH,
} from "../src/utils/og";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const outputDir = path.join(projectRoot, "public", "og");

const fontRegular =
	"https://api.fontsource.org/v1/fonts/inter/latin-400-normal.ttf";
const fontBold =
	"https://api.fontsource.org/v1/fonts/inter/latin-700-normal.ttf";

async function toBuffer(body: BodyInit): Promise<Buffer> {
	if (body instanceof ArrayBuffer) return Buffer.from(body);
	if (ArrayBuffer.isView(body)) {
		return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
	}
	if (typeof body === "string") return Buffer.from(body);
	if (body instanceof Blob) {
		return Buffer.from(await body.arrayBuffer());
	}
	throw new Error(`Unsupported OG image body type: ${typeof body}`);
}

await mkdir(outputDir, { recursive: true });

const uniquePages = Array.from(
	new Map(OG_PAGE_CONFIG.map((page) => [page.slug, page])).values(),
);

for (const page of uniquePages) {
	const image = await generateOpenGraphImage({
		title: page.imageTitle,
		description: page.imageDescription,
		logo: {
			path: "./public/maskable-icon-512x512.png",
			size: [88, 88],
		},
		bgGradient: [
			[15, 23, 42],
			[12, 74, 110],
			[30, 41, 59],
		],
		border: {
			color: [6, 182, 212],
			width: 16,
			side: "inline-start",
		},
		padding: 72,
		font: {
			title: {
				color: [241, 245, 249],
				size: 78,
				lineHeight: 1.05,
				families: ["Inter"],
			},
			description: {
				color: [148, 163, 184],
				size: 34,
				lineHeight: 1.3,
				families: ["Inter"],
			},
		},
		fonts: [fontBold, fontRegular],
		format: "PNG",
		quality: 100,
	});

	const outputPath = path.join(outputDir, `${page.slug}.png`);
	await writeFile(outputPath, await toBuffer(image));
	console.log(
		`Generated OG image ${page.slug}.png (${OG_IMAGE_WIDTH}x${OG_IMAGE_HEIGHT})`,
	);
}
