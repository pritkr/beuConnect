console.log("CWD:", process.cwd());
console.log("UID:", process.getuid());
try {
    const res = await fetch("http://localhost:4321/api/result?format=json&reg=21101157001&sem=8");
    const data = await res.json();
    console.log("Fetch success:", data.status);
} catch (e) {
    console.log("Fetch failed:", e.message);
}
