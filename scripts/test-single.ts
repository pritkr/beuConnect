import { fetchFullStudentData } from "./scraper/crawler.js";

async function test() {
    console.log("Testing JSON Endpoint: 24 Batch, Sem 2, Reg 24105157001");
    const match = await fetchFullStudentData("24105157001", 2, "24");
    console.log("Match Found:", match.found);
    console.log("Data Payload Keys:", match.data ? Object.keys(match.data) : "None");
    if (match.data) {
        console.log("Sample practical Subjects:", match.data.practicalSubjects);
        console.log("Sample theory Subjects:", match.data.theorySubjects);
    }
}

test().catch(console.error);
