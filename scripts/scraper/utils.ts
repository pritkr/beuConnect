export async function mapLimit<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
	const results = new Array(items.length);
	let nextIndex = 0;

	async function worker() {
		while (true) {
			const currentIndex = nextIndex;
			nextIndex += 1;
			if (currentIndex >= items.length) return;
			try {
				results[currentIndex] = await mapper(items[currentIndex], currentIndex);
			} catch (err) {
				console.error(`Worker error at index ${currentIndex}:`, err);
				results[currentIndex] = null;
			}
		}
	}

	const workerCount = Math.max(1, Math.min(limit, items.length));
	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	return results;
}

export function parseArgs(argv: string[]): Record<string, string> {
	const args: Record<string, string> = {};
	for (let i = 0; i < argv.length; i++) {
		if (argv[i].startsWith("--")) {
			const splitted = argv[i].split("=");
			if (splitted.length > 1) {
				args[splitted[0].slice(2)] = splitted[1];
			} else {
				args[argv[i].slice(2)] = argv[i + 1] || "true";
				i++;
			}
		}
	}
	return args;
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
        // We use native bun/node fetch
		return await fetch(url, { ...init, signal: controller.signal });
	} finally {
		clearTimeout(timer);
	}
}

export function sanitizeField(val: string | number | null | undefined): string {
	if (val === null || val === undefined) return "";
    let clean = String(val).trim().replace(/[\r\n\t]/g, " ");
	if (clean.includes(",")) return `"${clean}"`;
	return clean;
}
