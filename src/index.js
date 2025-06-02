const path = require('path');
const fs = require('fs');

const { PDFDocument, rgb, degrees } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const text = require('../text.json');

const templatesPath = path.join(process.cwd(), 'templates');
const resultFolderPath = path.join(process.cwd(), 'result');
const resultPath = path.join(resultFolderPath, 'result.pdf');
const fontPath = path.join(process.cwd(), 'src', 'OpenSans-Regular.ttf');

const reorderPages = (pdfDoc, newOrder) => {
  const pages = pdfDoc.getPages();
  for (let currentPage = 0; currentPage < newOrder.length; currentPage++) {
    pdfDoc.removePage(currentPage);
    pdfDoc.insertPage(currentPage, pages[newOrder[currentPage]]);
  }
};

const hidePageNumber = (pdfDoc, pageNumberIndex, x) => {
  const page = pdfDoc.getPages()[pageNumberIndex];
  const { width, height } = page.getSize();

  page.drawRectangle({
    x: typeof x === 'number' ? x : width - 10,
    y: height - 10,
    width: 30,
    height: 30,
    color: rgb(1, 1, 1),
  });
};

const addText = async (pdfDocBytes, textOptions = []) => {
  const pdfDoc = await PDFDocument.load(pdfDocBytes);

  pdfDoc.registerFontkit(fontkit);

  const font = await pdfDoc.embedFont(fs.readFileSync(fontPath));

  const page = pdfDoc.getPages()[3];

  for (let index = 0; index < textOptions.length; index++) {
    const { text, ...restOptions } = textOptions[index];

    page.drawText(text, {
      x: 25,
      y: 416,
      font,
      size: 9,
      color: rgb(0, 0, 0),
      ...restOptions,
    });
  }

  pdfDoc.save();

  return pdfDoc;
};

const transformPage = async (pdfDocBytes) => {
  const portraitWidth = 595.28; // A4 width in points
  const portraitHeight = 841.89; // A4 height in points
  const landscapeWidth = 841.89; // A4 height in points
  const landscapeHeight = 595.28; // A4 width in points

  const pdfDoc = await PDFDocument.load(pdfDocBytes);

  //Hide pages counter
  hidePageNumber(pdfDoc, 2, 0);
  hidePageNumber(pdfDoc, 3);

  //Change pages order
  reorderPages(pdfDoc, [3, 0, 1, 2]);

  // Create a new PDF
  const newPdf = await PDFDocument.create();
  const pageCount = pdfDoc.getPageCount();

  for (let i = 0; i < pageCount; i += 2) {
    const newPage = newPdf.addPage([landscapeWidth, landscapeHeight]);

    const firstPage = await newPdf.embedPage(pdfDoc.getPage(i));
    const firstPageScale = Math.min(landscapeWidth / portraitWidth, landscapeHeight / portraitHeight);

    newPage.drawPage(firstPage, {
      x: 0,
      y: 0,
      width: portraitWidth * firstPageScale,
      height: portraitHeight * firstPageScale,
    });

    if (i + 1 < pageCount) {
      const secondPage = await newPdf.embedPage(pdfDoc.getPage(i + 1));

      newPage.drawPage(secondPage, {
        x: landscapeWidth / 2,
        y: 0,
        width: portraitWidth * firstPageScale,
        height: portraitHeight * firstPageScale,
      });
    }
  }

  return newPdf;
};

(async () => {
  const pdfFilesPaths = fs
    .readdirSync(templatesPath)
    .filter((item) => item.endsWith('.pdf'))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  let counter = 0;
  const mergedPdf = await PDFDocument.create();

  for (const pdfFilesPath of pdfFilesPaths) {
    const textOptionsIndex = counter % text.length;
    const textOptions = text[textOptionsIndex];

    const pdfDocBytes = fs.readFileSync(path.join(templatesPath, pdfFilesPath));

    const pdfWithText = await addText(pdfDocBytes, textOptions);

    const pdfWithTextDocBytes = await pdfWithText.save();

    const pdf = await transformPage(pdfWithTextDocBytes);
    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());

    copiedPages.forEach((page) => mergedPdf.addPage(page));

    counter++;
  }

  const modifiedPdfBytes = await mergedPdf.save();

  if (!fs.existsSync(resultFolderPath)) {
    fs.mkdirSync(resultFolderPath);
  }

  fs.writeFileSync(resultPath, modifiedPdfBytes, { flag: 'w' });
})();
