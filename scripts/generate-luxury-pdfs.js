#!/usr/bin/env node
/**
 * Generate branded "luxury" PDF assets for the premium tier.
 * Output: ./luxury-pdfs/*.pdf — upload these to Firebase Storage under luxury-pdfs/.
 * Usage: node scripts/generate-luxury-pdfs.js
 */
import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';

const OUT_DIR = path.resolve(process.cwd(), 'luxury-pdfs');

const GOLD = '#d4af37';
const GOLD_BRIGHT = '#f4e8c1';
const NAVY = '#0a1a3a';
const INK = '#20242c';

const DOCS = [
  {
    file: 'luxury-resume-templates.pdf',
    title: 'Luxury Resume Templates',
    subtitle: 'ATS-optimized premium layouts for senior professionals',
    sections: [
      {
        heading: 'Project-First Layout',
        body: 'Open with measurable outcomes, not duties. Lead each role with the result you produced, then the actions that delivered it. Recruiters scan the top third of a resume in seconds.',
      },
      {
        heading: 'Keyword Alignment',
        body: 'Mirror the language of the job description honestly. Match the title, tools, and certifications that the posting lists so the ATS ranks your profile against the role.',
      },
      {
        heading: 'One-Page Discipline',
        body: 'Every line must earn its place. Use 10-12pt typography, a clean two-column grid, and generous white space for a premium, scannable finish.',
      },
    ],
  },
  {
    file: 'luxury-cover-letter-guide.pdf',
    title: 'Luxury Cover Letter Guide',
    subtitle: 'A persuasive narrative that complements your resume',
    sections: [
      {
        heading: 'The 3-Paragraph Arc',
        body: 'Hook, proof, and ask. Open with a specific achievement, connect it to the target role, and close with a clear, confident invitation to continue the conversation.',
      },
      {
        heading: 'Tone Matching',
        body: 'Write the way the company speaks. A startup wants energy and ownership; an enterprise wants precision and risk management. Adjust your register accordingly.',
      },
      {
        heading: 'No Resume Repeat',
        body: 'The letter is your chance to add context the resume cannot — motivation, fit, and the story behind your transition. Never simply restate bullet points.',
      },
    ],
  },
  {
    file: 'luxury-career-guide.pdf',
    title: 'Luxury Career Guide',
    subtitle: 'Positioning, interviews, and negotiation for global careers',
    sections: [
      {
        heading: 'Positioning',
        body: 'Define your target market, title, and salary band before you start applying. A focused search outperforms a broad one in both response rate and final offer quality.',
      },
      {
        heading: 'Interview Mastery',
        body: 'Prepare four to five STAR story blocks — conflict, ambiguity, failure recovery, leadership without authority, and a quality save — so every question maps to a proof point.',
      },
      {
        heading: 'Negotiation',
        body: 'Anchor on total compensation, not base salary. Time your ask until after the offer, and always negotiate in writing with data to support your range.',
      },
    ],
  },
];

function buildPdf(doc) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      margins: { top: 64, bottom: 64, left: 64, right: 64 },
      info: { Title: doc.title, Author: 'Resumora' },
    });
    const outPath = path.join(OUT_DIR, doc.file);
    const stream = fs.createWriteStream(outPath);
    pdf.pipe(stream);

    const contentWidth = pdf.page.width - pdf.page.margins.left - pdf.page.margins.right;

    pdf.font('Helvetica-Bold').fontSize(11).fillColor(GOLD).text('RESUMORA', { align: 'right' });
    pdf.moveDown(2);
    pdf.font('Helvetica-Bold').fontSize(26).fillColor(NAVY).text(doc.title);
    pdf.font('Helvetica').fontSize(13).fillColor(GOLD).text(doc.subtitle);
    pdf.moveDown(1);
    pdf.rect(pdf.page.margins.left, pdf.y, contentWidth, 2).fill(GOLD);
    pdf.moveDown(1.5);

    for (const section of doc.sections) {
      pdf.font('Helvetica-Bold').fontSize(15).fillColor(NAVY).text(section.heading);
      pdf.moveDown(0.4);
      pdf.font('Helvetica').fontSize(11).fillColor(INK).text(section.body, {
        width: contentWidth,
        align: 'left',
      });
      pdf.moveDown(1.4);
    }

    const footerY = pdf.page.height - pdf.page.margins.bottom + 12;
    pdf
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#999999')
      .text('Resumora · resumora.net', 0, footerY, { width: pdf.page.width, align: 'center' });

    pdf.end();
    stream.on('finish', () => resolve(outPath));
    stream.on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const doc of DOCS) {
    const out = await buildPdf(doc);
    console.log(`\u2713 ${path.relative(process.cwd(), out)}`);
  }
  console.log(`\nGenerated ${DOCS.length} PDFs in ${OUT_DIR}`);
  console.log('Upload these to Firebase Storage under luxury-pdfs/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
