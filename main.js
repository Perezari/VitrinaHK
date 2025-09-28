window.jsPDF = window.jspdf.jsPDF;
function mm(v) { return Number.isFinite(v) ? v : 0; }

// Variables
const svg = document.getElementById('svg');
const overlay = document.querySelector('.svg-overlay');
const downloadBtn = document.getElementById('downloadBtn');
const batchSaveBtn = document.getElementById("batchSaveBtn");
batchSaveBtn.style.display = 'none';
const excelFileInput = document.getElementById('excelFile');
const fileNameSpan = document.querySelector('.file-name');
const sapakSelect = document.getElementById("Sapak");
const profileSelect = document.getElementById("profileType");
const frontW = document.getElementById("frontW");
const cabH = document.getElementById("cabH");
const topDistance = document.getElementById("topDistance");
const holeDiameter = document.getElementById("holeDiameter");
const rightInset = document.getElementById("rightInset");
const leftInset = document.getElementById("leftInset");
const unitContainer = document.getElementById("unitNum").parentElement;
let unitNumInput = document.getElementById("unitNum");
let excelRows = [];

// Adds a small dot (circle) to the SVG at specified coordinates.
// Sets default fill and stroke colors for visibility.
// Ensures the stroke remains thin and sharp when scaling or printing.
// Default radius is 2.2 units, but can be overridden.
function addDimDot(svg, x, y, r = 2.2) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', x);
    c.setAttribute('cy', y);
    c.setAttribute('r', r);
    // צבעי ברירת מחדל
    c.setAttribute('fill', '#54a5f5');
    c.setAttribute('stroke', 'black');
    // שומר על קו דק וחד בהדפסה
    c.setAttribute('stroke-width', '0.6');
    c.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(c);
}

// Adds a rotated note box with text to the SVG.
// Temporarily measures the text to size the box with padding.
// Inserts a <g> element containing the <rect> and <text>, rotated around the specified coordinates.
// Default rotation angle is 90 degrees.
function addNoteRotated(svg, x, y, text, angle = 90) {
    // מחשבים BBox זמני כדי להתאים את הריבוע
    const tempText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    tempText.setAttribute("class", "note-text");
    tempText.setAttribute("x", x);
    tempText.setAttribute("y", y);
    tempText.setAttribute("text-anchor", "middle");
    tempText.setAttribute("dominant-baseline", "middle");
    tempText.textContent = text;
    svg.appendChild(tempText);

    const bbox = tempText.getBBox();
    svg.removeChild(tempText);

    const padding = 10; // היה 10 – נותן עוד ביטחון להדפסה
    const rectX = bbox.x - padding;
    const rectY = bbox.y - padding;
    const rectW = bbox.width + padding * 2;
    const rectH = bbox.height + padding * 2;

    svg.insertAdjacentHTML("beforeend", `
    <g transform="rotate(${angle}, ${x}, ${y})">
      <rect class="note-box"
            x="${rectX}" y="${rectY}"
            width="${rectW}" height="${rectH}"></rect>
      <text class="note-text"
            x="${x}" y="${y}"
            text-anchor="middle"
            dominant-baseline="middle">
        ${text}
      </text>
    </g>
  `);
}

// Validates that all required input fields are filled.
// Shows an alert and highlights the first empty field.
// Returns true if all fields have values, false otherwise.
function validateRequiredFields(fields) {
    let allValid = true;
    for (let id of fields) {
        const input = document.getElementById(id);
        if (input) {
            if (input.value.trim() === '') {
                alert('אנא מלא את השדה: ' + input.previousElementSibling.textContent);
                input.style.border = '2px solid red';
                input.focus();
                allValid = false;
                break; // עוצר בלחיצה הראשונה
            } else {
                // אם השדה לא ריק – מחזיר את העיצוב הרגיל
                input.style.border = '';
            }
        }
    }
    return allValid;
}

function validateRequiredFields(fields) {
    let allValid = true;
    let firstEmptyField = null;
    const inputs = [];

    // מעבר ראשון – לבדוק מי ריק
    for (let id of fields) {
        const input = document.getElementById(id);
        if (input) {
            inputs.push(input);
            if (input.value.trim() === '') {
                allValid = false;
                if (!firstEmptyField) {
                    firstEmptyField = input;
                }
            }
        }
    }

    // מעבר שני – צביעת שדות
    for (let input of inputs) {
        input.classList.remove('error', 'valid');
        if (input.value.trim() === '') {
            input.classList.add('error'); // שדות ריקים באדום
        }
    }

    if (firstEmptyField) {
        firstEmptyField.focus();
        showCustomAlert('אנא מלא את השדה: ' + firstEmptyField.previousElementSibling.textContent, "error");
    } else {
        showCustomAlert("מייצר PDF - אנא המתן", "success");
    }

    return allValid;
}

// פונקציה להצגת הודעה מותאמת אישית
function showCustomAlert(message, type = "error") {
    const alertDiv = document.createElement('div');
    alertDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 15px 25px;
        border-radius: 10px;
        font-weight: 600;
        z-index: 1000;
        animation: slideIn 0.3s ease;
    `;

    if (type === "error") {
        alertDiv.style.background = "linear-gradient(135deg, #ffcdd2 0%, #f8bbd9 100%)";
        alertDiv.style.color = "#c62828";
        alertDiv.style.boxShadow = "0 5px 15px rgba(198, 40, 40, 0.3)";
        alertDiv.style.borderRight = "4px solid #c62828";
    } else if (type === "success") {
        alertDiv.style.background = "linear-gradient(135deg, #c8e6c9 0%, #a5d6a7 100%)";
        alertDiv.style.color = "#2e7d32";
        alertDiv.style.boxShadow = "0 5px 15px rgba(46, 125, 50, 0.3)";
        alertDiv.style.borderRight = "4px solid #2e7d32";
    }

    // ספינר רק אם זה success
    if (type === "success") {
        const spinner = document.createElement("div");
        spinner.style.cssText = `
                width: 20px;
                height: 20px;
                border: 3px solid rgba(27, 94, 32, 0.3);
                border-top: 3px solid #1b5e20;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                flex-shrink: 0;
        `;
        alertDiv.appendChild(spinner);
    }

    // מוחק את ההודעה אחרי 3 שניות (רק בשגיאה)
    if (type === "success") {
        setTimeout(() => {
            alertDiv.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (alertDiv.parentNode) {
                    alertDiv.parentNode.removeChild(alertDiv);
                }
            }, 300);
        }, 3000);
    }

    // טקסט
    const text = document.createElement("span");
    text.textContent = message;
    alertDiv.appendChild(text);

    document.body.appendChild(alertDiv);

    // מוחק את ההודעה אחרי 3 שניות (רק בשגיאה)
    if (type === "error") {
        setTimeout(() => {
            alertDiv.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (alertDiv.parentNode) {
                    alertDiv.parentNode.removeChild(alertDiv);
                }
            }, 300);
        }, 3000);
    }
}

// אנימציות CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

// Populates the profile dropdown based on the selected supplier
function fillProfileOptions() {
    const selectedSapak = sapakSelect.value;
    const options = ProfileConfig.getProfilesBySupplier(selectedSapak);

    profileSelect.innerHTML = "";

    options.forEach(profile => {
        const optionEl = document.createElement("option");
        optionEl.value = profile;
        optionEl.textContent = profile;
        profileSelect.appendChild(optionEl);
    });

    draw();
}
fillProfileOptions();

// Finds a unit by number and fills the form fields with its properties
function searchUnit(unitNum) {
    if (!excelRows.length || !unitNum) return;

    const row = excelRows.find(r => {
        const val = r['יחידה'];
        if (val === undefined) return false;
        return String(val).trim() === String(unitNum).trim();
    });

    if (!row) return;

    frontW.value = row['רוחב'] || '';
    cabH.value = row['אורך'] || '';

    // קביעת כיוון דלת לפי שם החלק
    if (row['שם החלק']) {
        const partName = row['שם החלק'].toLowerCase();
        if (partName.includes('ימין')) sideSelect.value = 'right';
        else if (partName.includes('שמאל')) sideSelect.value = 'left';
    }

    // לוגיקה חדשה לזיהוי פרופיל וצבע
    if (row['סוג החומר']) {
        const materialType = String(row['סוג החומר']).trim();

        // חיפוש הפרופיל בהגדרות
        let foundProfileType = null;
        let remainingText = materialType;

        // חיפוש בכל סוגי הפרופילים בהגדרות
        for (const profileType in ProfileConfig.PROFILE_SETTINGS) {
            if (materialType.includes(profileType)) {
                foundProfileType = profileType;
                // הסרת סוג הפרופיל מהטקסט כדי לקבל את הצבע
                remainingText = materialType.replace(profileType, '').replace(/^_+|_+$/g, ''); // הסרת _ בהתחלה וסוף
                break;
            }
        }

        if (foundProfileType) {
            // הגדרת הצבע (מה שנשאר אחרי הסרת הפרופיל)
            document.getElementById('profileColor').value = remainingText || '';

            // מציאת הספק המתאים לפרופיל
            let foundSupplier = null;
            for (const supplier in ProfileConfig.SUPPLIERS_PROFILES_MAP) {
                if (ProfileConfig.SUPPLIERS_PROFILES_MAP[supplier].includes(foundProfileType)) {
                    foundSupplier = supplier;
                    break;
                }
            }

            if (foundSupplier) {
                sapakSelect.value = foundSupplier;
                fillProfileOptions();
            }

            profileSelect.value = foundProfileType;
        } else {
            // אם לא נמצא פרופיל בהגדרות, נשתמש בלוגיקה הישנה כגיבוי
            const parts = materialType.split('_');
            if (parts.length >= 2) {
                document.getElementById('profileColor').value = parts[0] || '';
                const profileType = parts[1];

                let foundSupplier = null;
                for (const supplier in ProfileConfig.SUPPLIERS_PROFILES_MAP) {
                    if (ProfileConfig.SUPPLIERS_PROFILES_MAP[supplier].includes(profileType)) {
                        foundSupplier = supplier;
                        break;
                    }
                }

                if (foundSupplier) {
                    sapakSelect.value = foundSupplier;
                    fillProfileOptions();
                }

                profileSelect.value = profileType || '';
            }
        }
    }

    if (row['מלואה']) {
        document.getElementById('glassModel').value = row['מלואה'];
    }

    draw();
}

//Overlay functions
function showOverlay() {
    const overlay = document.getElementById('overlay');
    overlay.style.display = 'flex';
    document.getElementById('overlayText').textContent = "שומר קבצים...";
    document.getElementById('overlayAnimation').textContent = "⏳";
}
function hideOverlayPending() {
    const overlay = document.getElementById('overlay');
    document.getElementById('overlayText').textContent = "קבצים נשלחו להורדה. אנא אשרו הורדות בדפדפן.";
    document.getElementById('overlayAnimation').textContent = "⬇️";
    setTimeout(() => { overlay.style.display = 'none'; }, 3000);
}

function generatePDFForUnit(unitNumber) {
    draw();
    downloadPdf();
}

// Generates a PDF from the current SVG and unit details on the page.
// Ensures Hebrew text uses the Alef font and applies all SVG styling and fixes.
// Clones the SVG, applies computed styles, fixes Hebrew text, centers dimensions, replaces markers, and sizes note boxes.
// Fits the SVG into the PDF page with proper scaling and margins.
// Adds unit detail fields as labeled boxes alongside the SVG.
// Adds supplier logos (PNG or SVG) to the PDF.
// Validates required fields before saving.
// Saves the PDF with a filename based on plan number, unit number, profile type, and side selection.
// Catches and reports errors during the PDF generation process.
async function downloadPdf() {
    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF(PDF_ORIENTATION, 'mm', PDF_SIZE);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        // קריאת נתוני היחידה
        const unitDetails = {
            Sapak: document.getElementById('Sapak').value,
            planNum: document.getElementById('planNum').value,
            unitNum: document.getElementById('unitNum').value,
            partName: document.getElementById('partName').value,
            profileType: document.getElementById('profileType').value,
            profileColor: document.getElementById('profileColor').value,
            glassModel: document.getElementById('glassModel').value,
            glassTexture: document.getElementById('glassTexture').value,
            prepFor: document.getElementById('prepFor').value,
        };

        ensureAlefFont(pdf);

        // ====== טיפול ב-SVG ======
        const svgElement = document.getElementById('svg');
        if (!svgElement) { alert('לא נמצא אלמנט SVG לייצוא'); return; }
        const svgClone = svgElement.cloneNode(true);

        withTempInDOM(svgClone, (attached) => {
            inlineComputedStyles(attached);
            fixHebrewText(attached);
            centerDimensionNumbers(attached);
            replaceMarkersWithTriangles(attached);
            forceNoteBoxesSize(attached, NOTE_BOX_W, NOTE_BOX_H);
            expandViewBoxToContent(attached);
        });

        const vb2 = svgClone.viewBox && svgClone.viewBox.baseVal;
        const vbWidth = vb2 && vb2.width ? vb2.width : 1000;
        const vbHeight = vb2 && vb2.height ? vb2.height : 1000;

        const marginForPrint = Math.max(PAGE_MARGIN_MM, PRINT_MIN_MARGIN_MM);
        const displayExtra = Math.min(EXTRA_SCALE, 1.0);
        const extraPaddingTop = 10; // מ"מ
        const box = fitAndPlaceBox(
            pdfWidth, pdfHeight - extraPaddingTop, vbWidth, vbHeight,
            marginForPrint, displayExtra, PRINT_SAFE_SHRINK, PRINT_ALIGN
        );
        box.y += extraPaddingTop; // דוחף את השרטוט למטה

        const options = { x: box.x, y: box.y, width: box.width, height: box.height, fontCallback: () => 'Alef' };
        let converted = false;

        if (typeof pdf.svg === 'function') {
            await pdf.svg(svgClone, options);
            converted = true;
        } else if (typeof window.svg2pdf === 'function') {
            await window.svg2pdf(svgClone, pdf, options);
            converted = true;
        }

        if (!converted) {
            const xml = new XMLSerializer().serializeToString(svgClone);
            const svg64 = window.btoa(unescape(encodeURIComponent(xml)));
            const imgSrc = 'data:image/svg+xml;base64,' + svg64;
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = imgSrc; });
            pdf.addImage(img, 'PNG', box.x, box.y, box.width, box.height);
        }

        // ====== פרטי יחידה ======
        const textX = pdfWidth - marginForPrint;
        let textY = marginForPrint + 10;
        const lineHeight = 7;

        function fixHebrew(text) {
            if (!text) return '';

            // זיהוי עברית
            const hebrewRegex = /[\u0590-\u05FF]/;

            if (hebrewRegex.test(text)) {
                // אם יש עברית – נהפוך את כל המחרוזת
                return text.split('').reverse().join('');
            }

            // אחרת אנגלית/מספרים – משאירים כמו שזה
            return text;
        }

        function addFieldBox(label, value, width = 40, height = 10) {
            if (!value) return;
            pdf.setFont('Alef', 'normal');
            pdf.setFontSize(12);
            pdf.setTextColor(44, 62, 80);
            pdf.setFillColor(245);
            pdf.setDrawColor(200);
            pdf.setLineWidth(0.3);
            pdf.roundedRect(textX - width, textY, width, height, 3, 3, 'FD');

            const fixedValue = fixHebrew(value);
            const fixedLabel = fixHebrew(label);

            pdf.text(fixedValue, textX - width / 2, textY + height / 2, { align: 'center', baseline: 'middle' });

            pdf.setFontSize(12);
            pdf.text(fixedLabel, textX - width / 2, textY - 1.5, { align: 'center' });

            textY += height + 7;
        }

        addFieldBox('הזמנה עבור', document.getElementById('Sapak').selectedOptions[0].text);
        addFieldBox('מספר תוכנית', unitDetails.planNum);
        addFieldBox('מספר יחידה', unitDetails.unitNum);
        addFieldBox('שם מפרק', unitDetails.partName);
        addFieldBox('סוג פרופיל', unitDetails.profileType);
        addFieldBox('גוון פרופיל', unitDetails.profileColor);
        addFieldBox('סוג זכוכית', unitDetails.glassModel);
        addFieldBox('כיוון טקסטורת זכוכית', document.getElementById('glassTexture').selectedOptions[0].text);
        addFieldBox('הכנה עבור', unitDetails.prepFor);

        // ====== הוספת לוגו לפי ספק ======
        function addLogo(pdf) {
            const supplier = unitDetails.Sapak;
            const logo = ProfileConfig.getLogoBySupplier(supplier);
            if (!supplier || !logo) return;

            const logoWidth = 40;
            const logoHeight = 25;
            pdf.addImage(logo, "PNG", 10, 10, logoWidth, logoHeight);
        }

        async function addLogoSvg(pdf, logo) {
            if (!logo) return;

            let svgText;

            // בדיקה אם זה Data URI (base64)
            if (logo.startsWith("data:image/svg+xml")) {
                const base64 = logo.split(",")[1];
                svgText = atob(base64);
            } else {
                // SVG כטקסט רגיל
                svgText = logo;
            }

            // ממירים ל־DOM
            const svgElement = new DOMParser().parseFromString(svgText, "image/svg+xml").documentElement;

            // מוסיפים ל־PDF
            await pdf.svg(svgElement, {
                x: 10,
                y: 10,
                width: 40,
                height: 25
            });
        }

        // לוגו מ־ProfileConfig (יכול להיות טקסט או Data URI)
        const logo = ProfileConfig.getLogoBySupplier("avivi_svg");
        await addLogoSvg(pdf, logo);

        const requiredFields = ['Sapak', 'planNum', 'unitNum', 'partName', 'profileType', 'profileColor', 'glassModel',];
        if (!validateRequiredFields(requiredFields)) return;

        // ====== שמירה ======
        function savePdf() {
            try {
                pdf.save(unitDetails.planNum + '_' + unitDetails.unitNum + '_' + unitDetails.profileType + '_HKTOP.pdf');
            } catch (_) {
                const blobUrl = pdf.output('bloburl');
                const a = document.createElement('a');
                a.href = blobUrl; a.download = 'שרטוט.pdf';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
            }
        }

        savePdf();

    } catch (err) {
        console.error('downloadPdf error:', err);
        alert('אירעה שגיאה בייצוא PDF. בדוק את הקונסול לפרטים.');
    }
}

// Draws a cabinet/front panel diagram in an SVG element.
// Includes frames, shelves, drill holes, dimensions, and rotated notes
// based on user input and profile settings.
// Also updates an HTML readout with the cabinet dimensions.
function draw() {
    const width = parseFloat(document.getElementById('frontW').value);
    const height = parseFloat(document.getElementById('cabH').value);
    const topDistance = parseFloat(document.getElementById('topDistance').value);
    const holeDiameter = parseFloat(document.getElementById('holeDiameter').value);
    const rightInset = parseFloat(document.getElementById('rightInset').value);
    const leftInset = parseFloat(document.getElementById('leftInset').value);
    const holeSpacing = 32;
    const numHoles = 4;
    const profileType = document.getElementById('profileType').selectedOptions[0].text;
    const settings = ProfileConfig.getProfileSettings(profileType);
    const padX = 500, padY = 50;

    // חישוב גודל ה-viewBox המלא כולל כל האלמנטים
    const totalWidth = padX + width + 480; // מרחב נוסף למידות
    const totalHeight = padY + height + 150; // מרחב נוסף למידות תחתונות

    // הגדרת viewBox שיאפשר התאמה אוטומטית
    svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // ברירות מחדל
    let GERONG = settings.hasGerong;
    let PAD_SIDES = settings.padSides;
    let PAD_TOPBOT = settings.padTopBot;

    svg.innerHTML = '';
    overlay.style.display = 'none';

    const offsetX = width / 2;
    const offsetY = height / 2;

    // מלבן חיצוני
    const outerRectX = width / 2;
    const outerRectY = height / 2;
    const outerRectW = width;
    const outerRectH = height;

    const outerRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    outerRect.setAttribute("x", outerRectX);
    outerRect.setAttribute("y", outerRectY);
    outerRect.setAttribute("width", outerRectW);
    outerRect.setAttribute("height", outerRectH);
    outerRect.setAttribute("fill", settings.outerFrameFill);
    outerRect.setAttribute("stroke", settings.outerFrameStroke);
    outerRect.setAttribute("stroke-width", settings.outerFrameStrokeWidth);
    svg.appendChild(outerRect);

    // מלבן פנימי מחושב לפי PAD
    const innerRectX = outerRectX + PAD_SIDES;
    const innerRectY = outerRectY + PAD_TOPBOT;
    const innerRectW = outerRectW - 2 * PAD_SIDES;
    const innerRectH = outerRectH - 2 * PAD_TOPBOT;

    const innerRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    innerRect.setAttribute("x", innerRectX);
    innerRect.setAttribute("y", innerRectY);
    innerRect.setAttribute("width", innerRectW);
    innerRect.setAttribute("height", innerRectH);
    innerRect.setAttribute("fill", settings.outerFrameFill);
    innerRect.setAttribute("stroke", settings.outerFrameStroke);
    innerRect.setAttribute("stroke-width", settings.outerFrameStrokeWidth);
    svg.appendChild(innerRect);

    if (GERONG) {
        // קווים אלכסוניים
        const corners = [
            { x1: outerRectX, y1: outerRectY, x2: innerRectX, y2: innerRectY },
            { x1: outerRectX + outerRectW, y1: outerRectY, x2: innerRectX + innerRectW, y2: innerRectY },
            { x1: outerRectX, y1: outerRectY + outerRectH, x2: innerRectX, y2: innerRectY + innerRectH },
            { x1: outerRectX + outerRectW, y1: outerRectY + outerRectH, x2: innerRectX + innerRectW, y2: innerRectY + innerRectH }
        ];
        corners.forEach(c => {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", c.x1);
            line.setAttribute("y1", c.y1);
            line.setAttribute("x2", c.x2);
            line.setAttribute("y2", c.y2);
            line.setAttribute("stroke", settings.outerFrameStroke);
            line.setAttribute("stroke-width", settings.outerFrameStrokeWidth);
            svg.appendChild(line);
        });
    } else {
        // קווים מלאים במקום גרונג
        const lines = [
            { x1: innerRectX - PAD_SIDES, y1: innerRectY, x2: innerRectX + innerRectW + PAD_SIDES, y2: innerRectY }, // עליון
            { x1: innerRectX - PAD_SIDES, y1: innerRectY + innerRectH, x2: innerRectX + innerRectW + PAD_SIDES, y2: innerRectY + innerRectH }, // תחתון
            { x1: innerRectX, y1: innerRectY, x2: innerRectX, y2: innerRectY + innerRectH }, // שמאל
            { x1: innerRectX + innerRectW, y1: innerRectY, x2: innerRectX + innerRectW, y2: innerRectY + innerRectH } // ימין
        ];
        lines.forEach(c => {
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", c.x1);
            line.setAttribute("y1", c.y1);
            line.setAttribute("x2", c.x2);
            line.setAttribute("y2", c.y2);
            line.setAttribute("stroke", settings.outerFrameStroke);
            line.setAttribute("stroke-width", settings.outerFrameStrokeWidth);
            svg.appendChild(line);
        });
    }

    // טקסט במרכז
    const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
    txt.setAttribute("x", offsetX + width / 2);
    txt.setAttribute("y", offsetY + height / 2 + 5);
    txt.setAttribute("text-anchor", "middle");
    txt.textContent = settings.CenterNotes;
    svg.appendChild(txt);

    // קידוחים
    const holesY = [];
    for (let i = 0; i < numHoles; i++) {
        const cy = offsetY + topDistance + i * holeSpacing;
        holesY.push(cy);

        // ימין
        const cxR = offsetX + width - rightInset;
        const circleR = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circleR.setAttribute("cx", cxR);
        circleR.setAttribute("cy", cy);
        circleR.setAttribute("r", holeDiameter / 2);
        circleR.setAttribute("fill", settings.outerFrameFill);
        circleR.setAttribute("stroke", settings.outerFrameStroke);
        svg.appendChild(circleR);

        // שמאל
        const cxL = offsetX + leftInset;
        const circleL = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circleL.setAttribute("cx", cxL);
        circleL.setAttribute("cy", cy);
        circleL.setAttribute("r", holeDiameter / 2);
        circleL.setAttribute("fill", settings.outerFrameFill);
        circleL.setAttribute("stroke", settings.outerFrameStroke);
        svg.appendChild(circleL);
    }

    // קווי מידה רוחב וגובה
    const dimGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    dimGroup.setAttribute("stroke", settings.outerFrameStroke);
    dimGroup.setAttribute("stroke-width", settings.outerFrameStrokeWidth);

    // קו רוחב עליון
    const dimTopY = offsetY - 40;
    const lineW = document.createElementNS("http://www.w3.org/2000/svg", "line");
    lineW.setAttribute("x1", offsetX);
    lineW.setAttribute("y1", dimTopY);
    lineW.setAttribute("x2", offsetX + width);
    lineW.setAttribute("y2", dimTopY);
    dimGroup.appendChild(lineW);

    // קווים אנכיים בקצוות
    const endLeft = document.createElementNS("http://www.w3.org/2000/svg", "line");
    endLeft.setAttribute("x1", offsetX);
    endLeft.setAttribute("y1", dimTopY - 5);
    endLeft.setAttribute("x2", offsetX);
    endLeft.setAttribute("y2", dimTopY + 5);
    dimGroup.appendChild(endLeft);

    const endRight = document.createElementNS("http://www.w3.org/2000/svg", "line");
    endRight.setAttribute("x1", offsetX + width);
    endRight.setAttribute("y1", dimTopY - 5);
    endRight.setAttribute("x2", offsetX + width);
    endRight.setAttribute("y2", dimTopY + 5);
    dimGroup.appendChild(endRight);

    // טקסט רוחב
    const textW = document.createElementNS("http://www.w3.org/2000/svg", "text");
    textW.setAttribute("x", offsetX + width / 2);
    textW.setAttribute("y", dimTopY - 8);
    textW.setAttribute("text-anchor", "middle");
    textW.setAttribute("class", "dim-text");
    textW.textContent = width;
    dimGroup.appendChild(textW);

    // קו גובה
    const dimX = offsetX - 40;
    const lineH = document.createElementNS("http://www.w3.org/2000/svg", "line");
    lineH.setAttribute("x1", dimX);
    lineH.setAttribute("y1", offsetY);
    lineH.setAttribute("x2", dimX);
    lineH.setAttribute("y2", offsetY + height);
    dimGroup.appendChild(lineH);

    // קווים אופקיים בקצוות
    const endTop = document.createElementNS("http://www.w3.org/2000/svg", "line");
    endTop.setAttribute("x1", dimX - 5);
    endTop.setAttribute("y1", offsetY);
    endTop.setAttribute("x2", dimX + 5);
    endTop.setAttribute("y2", offsetY);
    dimGroup.appendChild(endTop);

    const endBottom = document.createElementNS("http://www.w3.org/2000/svg", "line");
    endBottom.setAttribute("x1", dimX - 5);
    endBottom.setAttribute("y1", offsetY + height);
    endBottom.setAttribute("x2", dimX + 5);
    endBottom.setAttribute("y2", offsetY + height);
    dimGroup.appendChild(endBottom);

    // טקסט גובה
    const textH = document.createElementNS("http://www.w3.org/2000/svg", "text");
    textH.setAttribute("x", dimX - 12);
    textH.setAttribute("y", offsetY + height / 2);
    textH.setAttribute("transform", `rotate(-90, ${dimX - 12}, ${offsetY + height / 2})`);
    textH.setAttribute("text-anchor", "middle");
    textH.setAttribute("class", "dim-text");
    textH.textContent = height;
    dimGroup.appendChild(textH);

    svg.appendChild(dimGroup);

    // ===== קווי מידה של הכנסות צדדים =====
    const sideDimY = offsetY + height + 60;

    // שמאל
    const leftX = offsetX + leftInset;
    const leftLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    leftLine.setAttribute("x1", offsetX);
    leftLine.setAttribute("y1", sideDimY);
    leftLine.setAttribute("x2", leftX);
    leftLine.setAttribute("y2", sideDimY);
    leftLine.setAttribute("stroke", settings.outerFrameStroke);
    leftLine.setAttribute("stroke-width", settings.outerFrameStrokeWidth);
    svg.appendChild(leftLine);

    // קווים אנכיים בקצוות הקו
    const leftEnd1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
    leftEnd1.setAttribute("x1", offsetX);
    leftEnd1.setAttribute("y1", sideDimY - 5);
    leftEnd1.setAttribute("x2", offsetX);
    leftEnd1.setAttribute("y2", sideDimY + 5);
    leftEnd1.setAttribute("stroke", settings.outerFrameStroke);
    leftEnd1.setAttribute("stroke-width", settings.outerFrameStrokeWidth);
    svg.appendChild(leftEnd1);

    const leftEnd2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
    leftEnd2.setAttribute("x1", leftX);
    leftEnd2.setAttribute("y1", sideDimY - 5);
    leftEnd2.setAttribute("x2", leftX);
    leftEnd2.setAttribute("y2", sideDimY + 5);
    leftEnd2.setAttribute("stroke", settings.outerFrameStroke);
    leftEnd2.setAttribute("stroke-width", settings.outerFrameStrokeWidth);
    svg.appendChild(leftEnd2);

    const leftText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    leftText.setAttribute("x", offsetX + leftInset / 2);
    leftText.setAttribute("y", sideDimY - 8);
    leftText.setAttribute("text-anchor", "middle");
    leftText.setAttribute("class", "dim-text");
    leftText.textContent = leftInset;
    svg.appendChild(leftText);

    // ימין
    const rightX = offsetX + width - rightInset;
    const rightLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    rightLine.setAttribute("x1", rightX);
    rightLine.setAttribute("y1", sideDimY);
    rightLine.setAttribute("x2", offsetX + width);
    rightLine.setAttribute("y2", sideDimY);
    rightLine.setAttribute("stroke", settings.outerFrameStroke);
    rightLine.setAttribute("stroke-width", settings.outerFrameStrokeWidth);
    svg.appendChild(rightLine);

    // קווים אנכיים בקצוות הקו
    const rightEnd1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
    rightEnd1.setAttribute("x1", rightX);
    rightEnd1.setAttribute("y1", sideDimY - 5); // חצי גובה של הקו האנכי
    rightEnd1.setAttribute("x2", rightX);
    rightEnd1.setAttribute("y2", sideDimY + 5);
    rightEnd1.setAttribute("stroke", settings.outerFrameStroke);
    rightEnd1.setAttribute("stroke-width", settings.outerFrameStrokeWidth);
    svg.appendChild(rightEnd1);

    const rightEnd2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
    rightEnd2.setAttribute("x1", offsetX + width);
    rightEnd2.setAttribute("y1", sideDimY - 5);
    rightEnd2.setAttribute("x2", offsetX + width);
    rightEnd2.setAttribute("y2", sideDimY + 5);
    rightEnd2.setAttribute("stroke", settings.outerFrameStroke);
    rightEnd2.setAttribute("stroke-width", settings.outerFrameStrokeWidth);
    svg.appendChild(rightEnd2);


    const rightText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    rightText.setAttribute("x", rightX + rightInset / 2);
    rightText.setAttribute("y", sideDimY - 8);
    rightText.setAttribute("text-anchor", "middle");
    rightText.setAttribute("class", "dim-text");
    rightText.textContent = rightInset;
    svg.appendChild(rightText);

    // ===== קו מידה בין קידוחים =====
    const spacingY = offsetY + height + 90;
    const holeX = offsetX + leftInset; // לוקח את השמאל או ימין לפי צורך
    const firstHole = holesY[0];
    const secondHole = holesY[1];

    const spacingLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    spacingLine.setAttribute("x1", holeX + 20);
    spacingLine.setAttribute("y1", firstHole);
    spacingLine.setAttribute("x2", holeX + 20);
    spacingLine.setAttribute("y2", secondHole);
    spacingLine.setAttribute("stroke", "#007acc");
    svg.appendChild(spacingLine);

    // קווים מקשרים
    const dash1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
    dash1.setAttribute("x1", holeX);
    dash1.setAttribute("y1", firstHole);
    dash1.setAttribute("x2", holeX + 25);
    dash1.setAttribute("y2", firstHole);
    dash1.setAttribute("stroke", "#007acc");
    dash1.setAttribute("stroke-dasharray", "2,2");
    svg.appendChild(dash1);

    const dash2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
    dash2.setAttribute("x1", holeX);
    dash2.setAttribute("y1", secondHole);
    dash2.setAttribute("x2", holeX + 25);
    dash2.setAttribute("y2", secondHole);
    dash2.setAttribute("stroke", "#007acc");
    dash2.setAttribute("stroke-dasharray", "2,2");
    svg.appendChild(dash2);

    const spacingText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    spacingText.setAttribute("x", holeX + 35);
    spacingText.setAttribute("y", firstHole + 16 + 5);
    spacingText.setAttribute("text-anchor", "middle");
    spacingText.setAttribute("class", "dim-text");
    spacingText.textContent = holeSpacing;
    svg.appendChild(spacingText);

    // ===== קו מידה מרחק קידוח עליון =====
    const topDimX = offsetX + width + 30; // מיקום הקו מימין למלבן
    const firstHoleY = offsetY + topDistance;

    // קו אנכי שמראה את המרחק
    const topLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
    topLine.setAttribute("x1", topDimX);
    topLine.setAttribute("y1", offsetY);
    topLine.setAttribute("x2", topDimX);
    topLine.setAttribute("y2", firstHoleY);
    topLine.setAttribute("stroke", settings.outerFrameStroke);
    topLine.setAttribute("stroke-width", settings.outerFrameStrokeWidth);
    svg.appendChild(topLine);

    // קווים אנכיים קטנים בקצוות
    const topEnd1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
    topEnd1.setAttribute("x1", topDimX - 5);
    topEnd1.setAttribute("y1", offsetY);
    topEnd1.setAttribute("x2", topDimX + 5);
    topEnd1.setAttribute("y2", offsetY);
    topEnd1.setAttribute("stroke", settings.outerFrameStroke);
    topEnd1.setAttribute("stroke-width", settings.outerFrameStrokeWidth);
    svg.appendChild(topEnd1);

    const topEnd2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
    topEnd2.setAttribute("x1", topDimX - 5);
    topEnd2.setAttribute("y1", firstHoleY);
    topEnd2.setAttribute("x2", topDimX + 5);
    topEnd2.setAttribute("y2", firstHoleY);
    topEnd2.setAttribute("stroke", settings.outerFrameStroke);
    topEnd2.setAttribute("stroke-width", settings.outerFrameStrokeWidth);
    svg.appendChild(topEnd2);

    // טקסט עם המרחק
    const topText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    topText.setAttribute("x", topDimX + 12);
    topText.setAttribute("y", offsetY + topDistance / 2 + 5);
    topText.setAttribute("transform", `rotate(-90, ${topDimX + 12}, ${offsetY + topDistance / 2})`);
    topText.setAttribute("text-anchor", "middle");
    topText.setAttribute("class", "dim-text");
    topText.textContent = topDistance;
    svg.appendChild(topText);
    expandViewBoxToContent(svg); // ⬅️ הוסף את השורה הזו
}

//Listeners
sapakSelect.addEventListener("change", fillProfileOptions);
sapakSelect.addEventListener("change", draw);
profileSelect.addEventListener("change", draw);
frontW.addEventListener("change", draw);
cabH.addEventListener("change", draw);
topDistance.addEventListener("change", draw);
holeDiameter.addEventListener("change", draw);
rightInset.addEventListener("change", draw);
leftInset.addEventListener("change", draw);

// Load and process Excel file
excelFile.addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;

    // חילוץ מספר תוכנית מהשם
    const match = file.name.match(/^([A-Za-z0-9]+)_/);
    if (match) {
        document.getElementById('planNum').value = match[1];
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        // קודם נקרא את הכותרות (שורה 6 = index 6 -> השורה ה-7 בפועל)
        const headers = XLSX.utils.sheet_to_json(sheet, {
            range: 6,
            header: 1
        })[0]; // השורה הראשונה בטווח

        // עכשיו נקרא את השורות החל מהשורה שאחריה (range: 7)
        // ונכריח להשתמש בכותרות שקיבלנו
        excelRows = XLSX.utils.sheet_to_json(sheet, {
            range: 7,        // מתחיל מהשורה שאחרי הכותרות
            header: headers, // שימוש בכותרות ידניות
            defval: "",      // לא לאבד תאים ריקים
            raw: true,
            blankrows: true
        });

        // המרה של GENESIS לפורמט MT59_ג'נסיס והעברת הקוד לעמודת מלואה
        excelRows = excelRows.map(r => {
            if (r['סוג החומר'] && String(r['סוג החומר']).toUpperCase().includes("GENESIS")) {
                const materialType = String(r['סוג החומר']);
                const genesisIndex = materialType.toUpperCase().indexOf("GENESIS");

                // כל מה שנשאר אחרי GENESIS
                let remainder = materialType.substring(genesisIndex + "GENESIS".length);

                // אם מתחיל ב-_ אז מסירים את ה-_ הראשון בלבד
                if (remainder.startsWith('_')) {
                    remainder = remainder.substring(1);
                }

                r['סוג החומר'] = "GENESIS_MT59";

                // שמירת העודף בעמודת מלואה אם קיים
                if (remainder) {
                    r['מלואה'] = remainder;
                }
            }
            return r;
        });

        console.log("עמודות שהתקבלו:", Object.keys(excelRows[0]));
        console.log("דוגמה לשורה ראשונה:", excelRows[0]);

        // מציאת יחידות שיש להן לפחות דלת ימין/שמאל
        const validUnits = [...new Set(
            excelRows
                .filter(r => {
                    const partName = (r['שם החלק'] || "").toLowerCase();
                    return partName.includes("קלפה");
                })
                .map(r => String(r['יחידה']).trim())
                .filter(u => u && u !== "undefined")
        )];

        if (validUnits.length === 0) {
            alert("לא נמצאה אף יחידה עם דלת קלפה בקובץ. לא ניתן להמשיך.");

            // השבתת כפתורים
            batchSaveBtn.disabled = true;
            batchSaveBtn.style.backgroundColor = "#ccc";
            batchSaveBtn.style.cursor = "not-allowed";

            downloadBtn.disabled = true;
            downloadBtn.style.backgroundColor = "#ccc";
            downloadBtn.style.cursor = "not-allowed";

            // איפוס השרטוט
            const svg = document.getElementById('svg');
            const overlay = document.querySelector('.svg-overlay');
            if (svg) svg.innerHTML = "";   // מוחק את תוכן ה־SVG
            if (overlay) overlay.style.display = 'none';

            return;
        } else {
            // הפעלה מחדש של כפתורים אם הכל תקין
            batchSaveBtn.disabled = false;
            batchSaveBtn.style.backgroundColor = "";
            batchSaveBtn.style.cursor = "pointer";

            downloadBtn.disabled = false;
            downloadBtn.style.backgroundColor = "";
            downloadBtn.style.cursor = "pointer";
        }

        // הפיכת השדה unitNum לרשימה נפתחת אם הוא עדיין input
        if (unitNumInput.tagName.toLowerCase() === "input") {
            const select = document.createElement("select");
            select.id = "unitNum";

            validUnits.forEach((unit, index) => {
                const option = document.createElement("option");
                option.value = unit;
                option.textContent = unit;
                select.appendChild(option);

                if (index === 0) select.value = unit;
            });

            unitContainer.replaceChild(select, unitNumInput);
            unitNumInput = select;
        }

        unitNumInput.addEventListener("change", function () {
            searchUnit(this.value);
        });

        searchUnit(unitNumInput.value);

        sapakSelect.disabled = true;
        sapakSelect.title = "שדה זה נטען אוטומטית מהקובץ ולא ניתן לשינוי";

        profileSelect.disabled = true;
        profileSelect.title = "שדה זה נטען אוטומטית מהקובץ ולא ניתן לשינוי";

        planNum.readOnly = true;
        planNum.disabled = true;
        planNum.style.backgroundColor = "#f8f9fb";
        planNum.style.color = '#888888';
        planNum.style.userSelect = 'none';
        planNum.title = "שדה זה נטען אוטומטית מהקובץ ולא ניתן לשינוי";

        glassModel.readOnly = true;
        glassModel.disabled = true;
        glassModel.style.backgroundColor = "#f8f9fb";
        glassModel.style.color = '#888888';
        glassModel.style.userSelect = 'none';
        glassModel.title = "שדה זה נטען אוטומטית מהקובץ ולא ניתן לשינוי";

        profileColor.readOnly = true;
        profileColor.disabled = true;
        profileColor.style.backgroundColor = "#f8f9fb";
        profileColor.style.color = '#888888';
        profileColor.style.userSelect = 'none';
        profileColor.title = "שדה זה נטען אוטומטית מהקובץ ולא ניתן לשינוי";

        frontW.readOnly = true;
        frontW.disabled = true;
        frontW.style.backgroundColor = "#f8f9fb";
        frontW.style.color = '#888888';
        frontW.style.userSelect = 'none';
        frontW.title = "שדה זה נטען אוטומטית מהקובץ ולא ניתן לשינוי";

        cabH.readOnly = true;
        cabH.disabled = true;
        cabH.style.backgroundColor = "#f8f9fb";
        cabH.style.color = '#888888';
        cabH.style.userSelect = 'none';
        cabH.title = "שדה זה נטען אוטומטית מהקובץ ולא ניתן לשינוי";
    };
    reader.readAsArrayBuffer(file);
});

// Search and display unit details when unit number is selected or typed
unitNumInput.addEventListener("input", function () {
    searchUnit(this.value);
});

// Single PDF generation for the currently selected unit
downloadBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try { await downloadPdf(); }
    catch (err) {
        console.error('[downloadPdf] failed:', err);
        alert('אירעה שגיאה בייצוא PDF. ראה קונסול.');
    }
});

// Batch generate PDFs for all corner cabinet units in the loaded Excel file
batchSaveBtn.addEventListener("click", async function () {
    if (!excelRows.length) return alert("אין קובץ Excel טעון!");

    showOverlay(); // מציג חלון המתנה

    // יצירת PDF לכל יחידה עם small delay כדי לייבא ערכים ל-DOM
    for (const row of excelRows) {
        if (!row['יחידה']) continue;

        const unitNumber = row['יחידה'];
        const partName = row['שם החלק'] || '';
        const material = row['סוג החומר'] || '';
        const glass = row['מלואה'] || '';

        // עדכון שדות כמו קודם
        frontW.value = row['רוחב'] || '';
        cabH.value = row['אורך'] || '';

        let profileType = '';
        let profileColor = '';
        if (material.includes('_')) [profileColor, profileType] = material.split('_');
        document.getElementById('profileColor').value = profileColor;

        let foundSupplier = null;
        for (const supplier in ProfileConfig.SUPPLIERS_PROFILES_MAP) {
            if (ProfileConfig.SUPPLIERS_PROFILES_MAP[supplier].includes(profileType)) {
                foundSupplier = supplier;
                break;
            }
        }
        if (foundSupplier) {
            sapakSelect.value = foundSupplier;
            fillProfileOptions();
        }

        profileSelect.value = profileType;
        document.getElementById('glassModel').value = glass;

        // עדכון שדה היחידה
        if (unitNumInput.tagName === 'SELECT') unitNumInput.value = unitNumber;
        else unitNumInput.value = unitNumber;

        const planNumber = document.getElementById('planNum').value;
        const fileName = `${planNumber}_${unitNumber}_${profileType}_HKTOP.pdf`;

        // מחכה קצת בין קבצים כדי לעדכן DOM
        await new Promise(resolve => setTimeout(resolve, 50));

        generatePDFForUnit(fileName);
    }

    hideOverlayPending(); // מציג ✓ בסוף
});

// Update displayed file name when a new Excel file is selected
excelFileInput.addEventListener('change', () => {
    if (excelFileInput.files.length > 0) {
        fileNameSpan.textContent = excelFileInput.files[0].name;
    } else {
        fileNameSpan.textContent = "לא נבחר קובץ";
    }
});

// Add loading state to buttons
const buttons = document.querySelectorAll('button');
buttons.forEach(button => {
    button.addEventListener('click', function () {
        this.classList.add('loading');
        setTimeout(() => {
            this.classList.remove('loading');
        }, 2000);
    });
});

// First draw
draw();