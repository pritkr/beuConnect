/**
 * The live paper markup, trimmed to three blocks, plus the route params the
 * catalogue passes for them.
 *
 * Shared by the parser's unit test and the paper route's cache test, so the
 * two cannot drift. The third block is deliberately empty: a block with no
 * sections must read as absent, never as a made-up paper.
 *
 * The page is synthetic only in its size. Every class, wrapper and attribute
 * below is the shape the site serves (verified against five live subject
 * pages, 88 blocks); the questions are the real 2025 digital-electronics ones.
 */

export const PAPER_PAGE_URL = "https://beu.prit.eu.org/pyqs/digital-electronics/";

const HEAD = (year: number, code: string, title: string) => `
  <header class="paper-head">
    <p class="paper-label"><span class="year num">${year}</span><span class="mono">${code}</span></p>
    <h2 class="paper-title">${title}</h2>
    <p class="paper-meta num"><span>3 hours</span><span>70 marks</span></p>
  </header>`;

const SECTION = (title: string, questions: string) => `
  <section class="paper-section">
    <header class="section-head">
      <h3 class="section-title"><span><p>${title}</p></span></h3>
      <div class="section-tools"></div>
    </header>
    <ol class="questions">${questions}</ol>
  </section>`;

export const PAPER_PAGE_HTML = `
<section class="paper-block" id="paper-100403-2025" data-astro-cid-a>
  ${HEAD(2025, "100403", "B.Tech Examination, 2025")}
  <div class="instructions">
    <h3>Instructions</h3>
    <ul><li>Attempt five questions.</li><li>Marks are in the right-hand margin.</li></ul>
  </div>
  <div class="questions-wrapper"><div class="pyq-dense-renderer">
    ${SECTION(
      "Questions",
      `
      <li class="question">
        <p class="q-num">Q1</p>
        <div class="q-body">
          <div class="q-text content-rich"><p>Explain the working of a PN junction diode.</p></div>
          <div class="sub-list">
            <div class="sub-item">
              <span class="sub-lbl">a)</span>
              <div class="sub-body"><div class="sub-text content-rich"><p>Forward bias</p></div></div>
              <span class="marks">2 marks</span>
            </div>
            <div class="sub-item">
              <span class="sub-lbl">b)</span>
              <div class="sub-body"><div class="sub-text content-rich"><p>Reverse bias</p></div></div>
              <span class="marks">3 marks</span>
            </div>
          </div>
        </div>
        <div class="q-tools"><span class="marks">5 marks</span></div>
      </li>
      <li class="question">
        <p class="q-num">Q2</p>
        <div class="q-body">
          <div class="q-text content-rich"><p>The binary code of 21.125 is</p></div>
          <div class="options-grid">
            <div class="opt-item"><span class="opt-lbl">a)</span><div class="opt-val content-rich"><p>10101.001</p></div></div>
            <div class="opt-item"><span class="opt-lbl">b)</span><div class="opt-val content-rich"><p>10101.010</p></div></div>
          </div>
        </div>
        <div class="q-tools"></div>
      </li>`,
    )}
  </div></div>
</section>
<section class="paper-block" id="paper-100403-2024-v2">
  ${HEAD(2024, "100403", "B.Tech Examination, 2024")}
  <div class="questions-wrapper"><div class="pyq-dense-renderer">
    ${SECTION("Q.1 Answer any seven", `<li class="question"><p class="q-num">Q1.1</p><div class="q-body"><div class="q-text content-rich"><p>State De Morgan's theorem.</p></div></div><div class="q-tools"><span class="marks">14 marks</span></div></li>`)}
  </div></div>
</section>
<section class="paper-block" id="paper-100403-2023">
  ${HEAD(2023, "100403", "B.Tech Examination, 2023")}
</section>
`;

/** The paper the page carries first. */
export const PAPER_2025 = {
  slug: "digital-electronics",
  id: "2025",
  code: "100403",
  year: 2025,
  title: "B.Tech Examination, 2025",
};

/** A second paper on the same page: one page load must cache both. */
export const PAPER_2024_V2 = {
  slug: "digital-electronics",
  id: "2024_v2",
  code: "100403",
  year: 2024,
  variant: "v2",
  title: "B.Tech Examination, 2024",
};

/** A catalogue row the page does not carry (it has only an empty 2023 block). */
export const PAPER_2019 = {
  slug: "digital-electronics",
  id: "2019",
  code: "100403",
  year: 2019,
  title: "B.Tech Examination, 2019",
};
