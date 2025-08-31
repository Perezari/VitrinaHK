window.jsPDF = window.jspdf.jsPDF;
function mm(v) { return Number.isFinite(v) ? v : 0; }

// ==== פרמטרים להתאמה מהירה ====
const PDF_ORIENTATION = 'l';   // landscape
const PDF_SIZE = 'a4';
const PAGE_MARGIN_MM = 1;     // מרווח למסך/תצוגה
const EXTRA_SCALE = 1;  // הגדלה לתצוגה

// ==== פרמטרים ייעודיים להדפסה (PDF) ====
const PRINT_MIN_MARGIN_MM = 10;   // שוליים בטוחים להדפסה
const PRINT_SAFE_SHRINK = 0.92; // כיווץ קל כדי למנוע חיתוך בקצה הנייר
const PRINT_ALIGN = 'left'; // 'left' | 'center'

// ==== גודל קבוע למסגרות ההערה (צהובות) ====
// שחק עם הערכים עד שזה עוטף את כל הטקסט בהדפסה:
const NOTE_BOX_W = 430;  // רוחב בפיקסלים-סגוליים של ה-SVG
const NOTE_BOX_H = 30;   // גובה בפיקסלים-סגוליים של ה-SVG

// ===== עזרי פונט עברית =====
function ensureAlefFont(pdf) {
    try {
        const list = pdf.getFontList ? pdf.getFontList() : null;
        const hasAlef = !!(list && (list.Alef || list['Alef']));
        if (hasAlef) { pdf.setFont('Alef', 'normal'); return; }
    } catch (_) { }
    if (typeof window.registerAlefFontOn === 'function') {
        const ok = window.registerAlefFontOn(pdf);
        if (ok) { pdf.setFont('Alef', 'normal'); return; }
    }
    if (typeof alefBase64 === 'string' && alefBase64.length > 100) {
        try {
            pdf.addFileToVFS('Alef-Regular.ttf', alefBase64);
            pdf.addFont('Alef-Regular.ttf', 'Alef', 'normal');
            pdf.setFont('Alef', 'normal');
            return;
        } catch (e) { console.warn('Font registration from base64 failed:', e); }
    }
    console.warn('Alef font not found; Hebrew may not render correctly.');
}

function withTempInDOM(svgNode, work) {
    const holder = document.createElement('div');
    holder.style.position = 'fixed';
    holder.style.left = '-10000px';
    holder.style.top = '-10000px';
    holder.style.opacity = '0';
    document.body.appendChild(holder);
    holder.appendChild(svgNode);
    try { return work(svgNode); }
    finally { document.body.removeChild(holder); }
}

function expandViewBoxToContent(svg, padding = 8) {
    const bbox = svg.getBBox();
    const minX = Math.floor(bbox.x - padding);
    const minY = Math.floor(bbox.y - padding);
    const width = Math.ceil(bbox.width + 2 * padding);
    const height = Math.ceil(bbox.height + 2 * padding);
    svg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
}

// ===== המרת CSS לערכי attributes (stroke/dash/fill וכו׳) =====
function inlineComputedStyles(svgRoot) {
    svgRoot.querySelectorAll('*').forEach(el => {
        const cs = window.getComputedStyle(el);

        // === טקסט ===
        if (el.tagName === 'text') {
            if (!el.getAttribute('font-family')) el.setAttribute('font-family', 'Alef');
            el.setAttribute('stroke', 'none');  // בטקסט אין stroke
            return; // אין צורך להוסיף stroke/width/dash
        }

        // === stroke, stroke-width, stroke-dasharray ===
        const stroke = cs.stroke && cs.stroke !== 'none' ? cs.stroke : null;
        const strokeWidth = cs.strokeWidth && cs.strokeWidth !== '0px' ? parseFloat(cs.strokeWidth) : null;
        const dash = cs.strokeDasharray && cs.strokeDasharray !== 'none' ? cs.strokeDasharray : null;

        if (stroke) el.setAttribute('stroke', stroke);
        if (strokeWidth) el.setAttribute('stroke-width', strokeWidth);
        if (dash) el.setAttribute('stroke-dasharray', dash);

        // עובי קו קבוע למרות סקייל
        el.setAttribute('vector-effect', 'non-scaling-stroke');

        // === קווי מידות ===
        if (el.classList && el.classList.contains('dim')) {
            if (!el.getAttribute('stroke')) el.setAttribute('stroke', 'black');
            if (!el.getAttribute('stroke-width')) el.setAttribute('stroke-width', '0.6');
        }

        // === fill ===
        const fillCss = cs.fill && cs.fill !== 'rgba(0, 0, 0, 1)' ? cs.fill : null;

        if (['rect', 'path', 'polygon', 'polyline', 'circle', 'ellipse'].includes(el.tagName)) {
            if (el.classList && el.classList.contains('note-box')) {
                if (fillCss) el.setAttribute('fill', fillCss);
                if (!el.getAttribute('stroke')) el.setAttribute('stroke', 'black');
                if (!el.getAttribute('stroke-dasharray') && dash) el.setAttribute('stroke-dasharray', dash);
            } else {
                if (fillCss) {
                    el.setAttribute('fill', fillCss);
                } else if (!el.hasAttribute('fill')) {
                    el.setAttribute('fill', 'none');
                }
            }
        }
    });
}

// ===== תיקון טקסט עברית (bidi-override) =====
function fixHebrewText(svgRoot) {
    const hebrewRegex = /[\u0590-\u05FF]/;
    svgRoot.querySelectorAll('text').forEach(t => {
        const txt = (t.textContent || '').trim();
        if (!txt) return;
        if (hebrewRegex.test(txt)) {
            const reversed = txt.split('').reverse().join('');
            t.textContent = reversed;
            t.setAttribute('direction', 'ltr');
            t.setAttribute('unicode-bidi', 'bidi-override');
            t.setAttribute('font-family', 'Alef');
        }
    });
    svgRoot.setAttribute('direction', 'rtl');
}

/**
 * מרכז מספרי מידות על הקווים האנכיים או אופקיים,
 * כולל תמיכה בטקסטים עם סיבוב (rotate)
 * -- הערות: שמרנו את השינויים שלך והוספנו אופסט קטן
 */
function centerDimensionNumbers(svgRoot) {
    const numRegex = /^[\d\s\.\-+×xX*]+(?:mm|מ"מ|)$/;

    // גודל האופסט מהקו (יכול להיות חיובי או שלילי)
    const offset = 20; // ניתן לשנות את הערך לפי הצורך

    svgRoot.querySelectorAll('text').forEach(t => {
        const raw = t.textContent || '';
        const txt = raw.replace(/\s+/g, '');
        if (!txt) return;

        if (numRegex.test(txt)) {
            // מרכז אופקי
            t.setAttribute('text-anchor', 'middle');

            // **שורה חדשה לשינוי גודל הפונט**
            t.setAttribute('font-size', '15'); // הגדלתי מ-15 ל-18
            t.setAttribute('font-family', 'Alef');

            // --- הערות שלך: ביטלתי dominant-baseline / alignment-baseline כדי לא לשבור סיבוב
             t.setAttribute('dominant-baseline', 'middle');
             t.setAttribute('alignment-baseline', 'middle');
             t.setAttribute('dy', '0.35em');

            // אם הטקסט מסתובב, לחשב מחדש את ה-x וה-y עם אופסט קטן
            const transform = t.getAttribute('transform');
            if (transform && transform.includes('rotate')) {
                const match = /rotate\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/.exec(transform);
                if (match) {
                    const xRot = parseFloat(match[2]);
                    const yRot = parseFloat(match[3]);
                    // הזזת הטקסט מהקו
                    const angle = parseFloat(match[1]);
                    if (Math.abs(angle) === 90) {
                        // טקסט אנכי: הזזה אופקית
                        t.setAttribute('x', xRot);
                        t.setAttribute('y', yRot - 12);
                    } else {
                        // טקסט אופקי: הזזה אנכית
                        t.setAttribute('x', xRot);
                        t.setAttribute('y', yRot);
                    }
                }
            } else {
                // טקסט אופקי רגיל: הזזה אנכית מהקו
                const y = parseFloat(t.getAttribute('y') || '0');
                t.setAttribute('y', y - offset + 5);
            }
        }
    });
}

// ===== חיצים במקום markers (תמיכה טובה יותר ב-PDF) =====
function replaceMarkersWithTriangles(svgRoot) {
    const lines = svgRoot.querySelectorAll('line, path, polyline');
    lines.forEach(el => {
        const hasMarker = el.getAttribute('marker-start') || el.getAttribute('marker-end');
        if (!hasMarker) return;

        // נתמוך בעיקר ב-line
        if (el.tagName !== 'line') {
            el.removeAttribute('marker-start');
            el.removeAttribute('marker-end');
            return;
        }

        const x1 = parseFloat(el.getAttribute('x1') || '0');
        const y1 = parseFloat(el.getAttribute('y1') || '0');
        const x2 = parseFloat(el.getAttribute('x2') || '0');
        const y2 = parseFloat(el.getAttribute('y2') || '0');
        const stroke = el.getAttribute('stroke') || '#000';
        const sw = parseFloat(el.getAttribute('stroke-width') || '1');

        const addTri = (x, y, angleRad) => {
            const size = Math.max(2.5 * sw, 3);
            const a = angleRad, s = size;
            const p1 = `${x},${y}`;
            const p2 = `${x - s * Math.cos(a - Math.PI / 8)},${y - s * Math.sin(a - Math.PI / 8)}`;
            const p3 = `${x - s * Math.cos(a + Math.PI / 8)},${y - s * Math.sin(a + Math.PI / 8)}`;
            const tri = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            tri.setAttribute('points', `${p1} ${p2} ${p3}`);
            tri.setAttribute('fill', stroke);
            tri.setAttribute('stroke', 'none');
            el.parentNode.insertBefore(tri, el.nextSibling);
        };

        const ang = Math.atan2(y2 - y1, x2 - x1);
        if (el.getAttribute('marker-start')) addTri(x1, y1, ang + Math.PI);
        if (el.getAttribute('marker-end')) addTri(x2, y2, ang);

        el.removeAttribute('marker-start');
        el.removeAttribute('marker-end');
    });
}

// ===== חישוב התאמה + מיקום (יישור לשמאל/מרכז) =====
function fitAndPlaceBox(pdfWidth, pdfHeight, vbWidth, vbHeight, margin = 10, extraScale = 1.0, printShrink = 1.0, align = 'center') {
    const rightSafeMargin = 45; // מרווח בטחון מצד ימין

    // זמינות רוחב וגובה עם שוליים
    const availW = pdfWidth - margin - rightSafeMargin;
    const availH = pdfHeight - 2 * margin;
    const vbRatio = vbWidth / vbHeight;
    const pageRatio = availW / availH;

    // התאמת מידות לשטח הזמין
    let drawW, drawH;
    if (vbRatio > pageRatio) { 
        drawW = availW; 
        drawH = drawW / vbRatio; 
    } else { 
        drawH = availH; 
        drawW = drawH * vbRatio; 
    }

    // שימוש בסקלות נוספות
    drawW *= extraScale * printShrink;
    drawH *= extraScale * printShrink;

    // ביטחון נוסף שלא יחרוג
    if (drawW > availW) { const s = availW / drawW; drawW *= s; drawH *= s; }
    if (drawH > availH) { const s = availH / drawH; drawW *= s; drawH *= s; }

    // מיקום X לפי יישור
    let x;
    if (align === 'left') {
        x = margin; // מתחיל משמאל
    } else if (align === 'center') {
        x = margin + (availW - drawW) / 2; // מרכז תוך כדי שמירה על rightSafeMargin
    } else {
        // אפשרות להוסיף ימין או אחרים בעתיד
        x = margin;
    }

    // מיקום Y - תמיד מרכז אנכית
    const y = (pdfHeight - drawH) / 2;

    return { x, y, width: drawW, height: drawH };
}

/**
 * מכריח כל rect.note-box להיות בגודל קבוע NOTE_BOX_W × NOTE_BOX_H,
 * ממורכז סביב text.note-text שבאותו <g> — בלי לשנות stroke-width.
 */
function forceNoteBoxesSize(svgRoot, w = NOTE_BOX_W, h = NOTE_BOX_H) {
    const groups = svgRoot.querySelectorAll('g');
    groups.forEach(g => {
        const rect = g.querySelector('rect.note-box');
        const text = g.querySelector('text.note-text');
        if (!rect || !text) return;

        // --- טקסט ממורכז וקריא ---
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
		t.setAttribute('font-family', 'Alef');
        text.setAttribute('font-size', '17');
        if (!text.getAttribute('fill')) text.setAttribute('fill', '#111');

        // מבטיח שהטקסט נכנס יפה במסגרת
        const tb = text.getBBox();
        const cx = tb.x + tb.width / 2;
        const cy = tb.y + tb.height / 2;

        // קופסה קבועה סביב הטקסט
        const x = cx - w / 2 - 5;
        const y = cy - h / 2 - 5;

        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(w));
        rect.setAttribute('height', String(h));

        // --- שיפורי נראות ---
        rect.setAttribute('rx', '6'); // פינות עגולות
        rect.setAttribute('ry', '6');
        rect.setAttribute('vector-effect', 'non-scaling-stroke');
        rect.setAttribute('shape-rendering', 'crispEdges');
        rect.setAttribute('fill-opacity', '0.9');

        // צבעים ברירת מחדל (אם לא קיימים)
        if (!rect.getAttribute('stroke')) rect.setAttribute('stroke', 'black');
        if (!rect.getAttribute('fill')) rect.setAttribute('fill', '#fff8b0');

        // דש-דש נשמר להדפסה
        const rc = getComputedStyle(rect);
        const dash = rc.strokeDasharray && rc.strokeDasharray !== 'none' ? rc.strokeDasharray : null;
        if (dash && !rect.getAttribute('stroke-dasharray')) {
            rect.setAttribute('stroke-dasharray', dash);
        }
    });

    // --- פילטר shadow (אם עדיין לא מוגדר) ---
    if (!svgRoot.querySelector('#noteBoxShadow')) {
        const defs = svgRoot.querySelector('defs') || svgRoot.insertBefore(document.createElementNS('http://www.w3.org/2000/svg', 'defs'), svgRoot.firstChild);
        const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        filter.setAttribute('id', 'noteBoxShadow');
        filter.setAttribute('x', '-10%');
        filter.setAttribute('y', '-10%');
        filter.setAttribute('width', '120%');
        filter.setAttribute('height', '120%');
        const fe = document.createElementNS('http://www.w3.org/2000/svg', 'feDropShadow');
        fe.setAttribute('dx', '1');
        fe.setAttribute('dy', '1');
        fe.setAttribute('stdDeviation', '1');
        fe.setAttribute('flood-color', '#888');
        fe.setAttribute('flood-opacity', '0.5');
        filter.appendChild(fe);
        defs.appendChild(filter);
    }

    // להוסיף את הצל לכל note-box
    svgRoot.querySelectorAll('rect.note-box').forEach(r => {
        r.setAttribute('filter', 'url(#noteBoxShadow)');
    });
}

// נקודת מידה כחולה שלא נעלמת ב-PDF ולא משתנה בעובי
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

// ====== פונקציית הייצוא ======
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
        const box = fitAndPlaceBox(
            pdfWidth, pdfHeight, vbWidth, vbHeight,
            marginForPrint, displayExtra, PRINT_SAFE_SHRINK, PRINT_ALIGN
        );

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
            return text.split('').reverse().join('');
        }

        function addFieldBox(label, value, width = 25, height = 10) {
            if (!value) return;
            pdf.setFont('Alef', 'normal');
            pdf.setFontSize(12);
            pdf.setTextColor(44, 62, 80);
            pdf.setFillColor(245);
            pdf.setDrawColor(200);
            pdf.setLineWidth(0.3);
            pdf.roundedRect(textX - width, textY, width, height, 3, 3, 'FD');

            const dontFix = ['מספר תוכנית', 'גוון פרופיל', 'סוג זכוכית', 'הכנה עבור'];
            const fixedValue = dontFix.includes(label) ? value : fixHebrew(value);

            pdf.text(fixedValue, textX - width / 2, textY + height / 2, { align: 'center', baseline: 'middle' });

            const fixedLabel = fixHebrew(label);
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
        const logosBase64 = {
        };

        function addLogo(pdf) {
            const supplier = unitDetails.Sapak;
            if (!supplier || !logosBase64[supplier]) return;

            const logoWidth = 25;
            const logoHeight = 25;
            pdf.addImage(logosBase64[supplier], "PNG", 10, 10, logoWidth, logoHeight);
        }

        addLogo(pdf);

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

        const requiredFields = ['Sapak', 'planNum', 'unitNum', 'partName', 'profileType', 'profileColor', 'glassModel',];
        if (!validateRequiredFields(requiredFields)) return;

        // ====== שמירה ======
        function savePdf() {
            try {
				pdf.save(unitDetails.planNum + '_' + unitDetails.unitNum + '_' + unitDetails.profileType + '.pdf');
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


const svg = document.getElementById('svg');
const overlay = document.querySelector('.svg-overlay');

function drawSVG() {
  const width = parseFloat(document.getElementById('frontW').value);
  const height = parseFloat(document.getElementById('cabH').value);
  const topDistance = parseFloat(document.getElementById('topDistance').value);
  const holeDiameter = parseFloat(document.getElementById('holeDiameter').value);
  const rightInset = parseFloat(document.getElementById('rightInset').value);
  const leftInset = parseFloat(document.getElementById('leftInset').value);

  const holeSpacing = 32;
  const numHoles = 4;

  svg.innerHTML = '';
  overlay.style.display = 'none';

const PAGE_WIDTH = 1000; // רוחב אזור הציור ב-SVG
const PAGE_HEIGHT = 600; // גובה אזור הציור ב-SVG

const offsetX = (PAGE_WIDTH - width) / 2;
const offsetY = (PAGE_HEIGHT - height) / 2;

const outerRectX = offsetX;
const outerRectY = offsetY;
const outerRectW = width;
const outerRectH = height;

const innerMargin = 10;
const innerRectX = outerRectX + innerMargin;
const innerRectY = outerRectY + innerMargin;
const innerRectW = outerRectW - 2 * innerMargin;
const innerRectH = outerRectH - 2 * innerMargin;

// מלבן חיצוני
const outerRect = document.createElementNS("http://www.w3.org/2000/svg","rect");
outerRect.setAttribute("x", outerRectX);
outerRect.setAttribute("y", outerRectY);
outerRect.setAttribute("width", outerRectW);
outerRect.setAttribute("height", outerRectH);
outerRect.setAttribute("fill","none");
outerRect.setAttribute("stroke","#000");
outerRect.setAttribute("stroke-width","1");
svg.appendChild(outerRect);

// מלבן פנימי
const innerRect = document.createElementNS("http://www.w3.org/2000/svg","rect");
innerRect.setAttribute("x", innerRectX);
innerRect.setAttribute("y", innerRectY);
innerRect.setAttribute("width", innerRectW);
innerRect.setAttribute("height", innerRectH);
innerRect.setAttribute("fill","none");
innerRect.setAttribute("stroke","#000");
innerRect.setAttribute("stroke-width","1");
svg.appendChild(innerRect);

// קווים אלכסוניים (גרונג) בפינות
const corners = [
  {x1: outerRectX, y1: outerRectY, x2: innerRectX, y2: innerRectY}, // עליון שמאל
  {x1: outerRectX + outerRectW, y1: outerRectY, x2: innerRectX + innerRectW, y2: innerRectY}, // עליון ימין
  {x1: outerRectX, y1: outerRectY + outerRectH, x2: innerRectX, y2: innerRectY + innerRectH}, // תחתון שמאל
  {x1: outerRectX + outerRectW, y1: outerRectY + outerRectH, x2: innerRectX + innerRectW, y2: innerRectY + innerRectH}, // תחתון ימין
];

corners.forEach(c => {
  const line = document.createElementNS("http://www.w3.org/2000/svg","line");
  line.setAttribute("x1", c.x1);
  line.setAttribute("y1", c.y1);
  line.setAttribute("x2", c.x2);
  line.setAttribute("y2", c.y2);
  line.setAttribute("stroke", "#000");
  line.setAttribute("stroke-width", "1");
  svg.appendChild(line);
});

  // טקסט במרכז
  const txt = document.createElementNS("http://www.w3.org/2000/svg","text");
  txt.setAttribute("x", offsetX + width/2);
  txt.setAttribute("y", offsetY + height/2 + 5);
  txt.setAttribute("text-anchor","middle");
  txt.textContent = "דלת קלפה";
  svg.appendChild(txt);

  // קידוחים
  const holesY = [];
  for (let i = 0; i < numHoles; i++) {
    const cy = offsetY + topDistance + i*holeSpacing;
    holesY.push(cy);

    // ימין
    const cxR = offsetX + width - rightInset;
    const circleR = document.createElementNS("http://www.w3.org/2000/svg","circle");
    circleR.setAttribute("cx", cxR);
    circleR.setAttribute("cy", cy);
    circleR.setAttribute("r", holeDiameter/2);
    circleR.setAttribute("fill", "#f0f0f0");
    circleR.setAttribute("stroke","#000");
    svg.appendChild(circleR);

    // שמאל
    const cxL = offsetX + leftInset;
    const circleL = document.createElementNS("http://www.w3.org/2000/svg","circle");
    circleL.setAttribute("cx", cxL);
    circleL.setAttribute("cy", cy);
    circleL.setAttribute("r", holeDiameter/2);
    circleL.setAttribute("fill", "#f0f0f0");
    circleL.setAttribute("stroke","#000");
    svg.appendChild(circleL);
  }

  // קווי מידה רוחב וגובה
  const dimGroup = document.createElementNS("http://www.w3.org/2000/svg","g");
dimGroup.setAttribute("stroke","#007acc");
dimGroup.setAttribute("stroke-width","1"); // בלי fill על הקבוצה


  // קו רוחב עליון
  const dimTopY = offsetY - 40;
  const lineW = document.createElementNS("http://www.w3.org/2000/svg","line");
  lineW.setAttribute("x1", offsetX);
  lineW.setAttribute("y1", dimTopY);
  lineW.setAttribute("x2", offsetX+width);
  lineW.setAttribute("y2", dimTopY);
  dimGroup.appendChild(lineW);

  // קווים אנכיים בקצוות
  const endLeft = document.createElementNS("http://www.w3.org/2000/svg","line");
  endLeft.setAttribute("x1", offsetX);
  endLeft.setAttribute("y1", dimTopY-5);
  endLeft.setAttribute("x2", offsetX);
  endLeft.setAttribute("y2", dimTopY+5);
  dimGroup.appendChild(endLeft);

  const endRight = document.createElementNS("http://www.w3.org/2000/svg","line");
  endRight.setAttribute("x1", offsetX+width);
  endRight.setAttribute("y1", dimTopY-5);
  endRight.setAttribute("x2", offsetX+width);
  endRight.setAttribute("y2", dimTopY+5);
  dimGroup.appendChild(endRight);

  // טקסט רוחב
  const textW = document.createElementNS("http://www.w3.org/2000/svg","text");
  textW.setAttribute("x", offsetX + width/2);
  textW.setAttribute("y", dimTopY - 8);
  textW.setAttribute("text-anchor","middle");
  textW.setAttribute("class", "dim-text");
  textW.textContent = width;
  dimGroup.appendChild(textW);

  // קו גובה
  const dimX = offsetX - 40;
  const lineH = document.createElementNS("http://www.w3.org/2000/svg","line");
  lineH.setAttribute("x1", dimX);
  lineH.setAttribute("y1", offsetY);
  lineH.setAttribute("x2", dimX);
  lineH.setAttribute("y2", offsetY+height);
  dimGroup.appendChild(lineH);

  // קווים אופקיים בקצוות
  const endTop = document.createElementNS("http://www.w3.org/2000/svg","line");
  endTop.setAttribute("x1", dimX-5);
  endTop.setAttribute("y1", offsetY);
  endTop.setAttribute("x2", dimX+5);
  endTop.setAttribute("y2", offsetY);
  dimGroup.appendChild(endTop);

  const endBottom = document.createElementNS("http://www.w3.org/2000/svg","line");
  endBottom.setAttribute("x1", dimX-5);
  endBottom.setAttribute("y1", offsetY+height);
  endBottom.setAttribute("x2", dimX+5);
  endBottom.setAttribute("y2", offsetY+height);
  dimGroup.appendChild(endBottom);

  // טקסט גובה
  const textH = document.createElementNS("http://www.w3.org/2000/svg","text");
  textH.setAttribute("x", dimX-12);
  textH.setAttribute("y", offsetY + height/2);
  textH.setAttribute("transform", `rotate(-90, ${dimX-12}, ${offsetY+height/2})`);
  textH.setAttribute("text-anchor","middle");
  textH.setAttribute("class", "dim-text");
  textH.textContent = height;
  dimGroup.appendChild(textH);

  svg.appendChild(dimGroup);

  // ===== קווי מידה של הכנסות צדדים =====
  const sideDimY = offsetY + height + 60;

// שמאל
const leftX = offsetX + leftInset;
const leftLine = document.createElementNS("http://www.w3.org/2000/svg","line");
leftLine.setAttribute("x1", offsetX);
leftLine.setAttribute("y1", sideDimY);
leftLine.setAttribute("x2", leftX);
leftLine.setAttribute("y2", sideDimY);
leftLine.setAttribute("stroke","#007acc");
svg.appendChild(leftLine);

// קווים אנכיים בקצוות הקו
const leftEnd1 = document.createElementNS("http://www.w3.org/2000/svg","line");
leftEnd1.setAttribute("x1", offsetX);
leftEnd1.setAttribute("y1", sideDimY - 5); 
leftEnd1.setAttribute("x2", offsetX);
leftEnd1.setAttribute("y2", sideDimY + 5);
leftEnd1.setAttribute("stroke","#007acc");
svg.appendChild(leftEnd1);

const leftEnd2 = document.createElementNS("http://www.w3.org/2000/svg","line");
leftEnd2.setAttribute("x1", leftX);
leftEnd2.setAttribute("y1", sideDimY - 5);
leftEnd2.setAttribute("x2", leftX);
leftEnd2.setAttribute("y2", sideDimY + 5);
leftEnd2.setAttribute("stroke","#007acc");
svg.appendChild(leftEnd2);

  const leftText = document.createElementNS("http://www.w3.org/2000/svg","text");
  leftText.setAttribute("x", offsetX + leftInset/2);
  leftText.setAttribute("y", sideDimY-8);
  leftText.setAttribute("text-anchor","middle");
  leftText.setAttribute("class", "dim-text");
  leftText.textContent = leftInset;
  svg.appendChild(leftText);

// ימין
const rightX = offsetX + width - rightInset;
const rightLine = document.createElementNS("http://www.w3.org/2000/svg","line");
rightLine.setAttribute("x1", rightX);
rightLine.setAttribute("y1", sideDimY);
rightLine.setAttribute("x2", offsetX + width);
rightLine.setAttribute("y2", sideDimY);
rightLine.setAttribute("stroke","#007acc");
svg.appendChild(rightLine);

// קווים אנכיים בקצוות הקו
const rightEnd1 = document.createElementNS("http://www.w3.org/2000/svg","line");
rightEnd1.setAttribute("x1", rightX);
rightEnd1.setAttribute("y1", sideDimY - 5); // חצי גובה של הקו האנכי
rightEnd1.setAttribute("x2", rightX);
rightEnd1.setAttribute("y2", sideDimY + 5);
rightEnd1.setAttribute("stroke","#007acc");
svg.appendChild(rightEnd1);

const rightEnd2 = document.createElementNS("http://www.w3.org/2000/svg","line");
rightEnd2.setAttribute("x1", offsetX + width);
rightEnd2.setAttribute("y1", sideDimY - 5);
rightEnd2.setAttribute("x2", offsetX + width);
rightEnd2.setAttribute("y2", sideDimY + 5);
rightEnd2.setAttribute("stroke","#007acc");
svg.appendChild(rightEnd2);


  const rightText = document.createElementNS("http://www.w3.org/2000/svg","text");
  rightText.setAttribute("x", rightX + rightInset/2);
  rightText.setAttribute("y", sideDimY-8);
  rightText.setAttribute("text-anchor","middle");
  rightText.setAttribute("class", "dim-text");
  rightText.textContent = rightInset;
  svg.appendChild(rightText);

  // ===== קו מידה בין קידוחים =====
  const spacingY = offsetY + height + 90;
  const holeX = offsetX + leftInset; // לוקח את השמאל או ימין לפי צורך
  const firstHole = holesY[0];
  const secondHole = holesY[1];

  const spacingLine = document.createElementNS("http://www.w3.org/2000/svg","line");
  spacingLine.setAttribute("x1", holeX + 20);
  spacingLine.setAttribute("y1", firstHole);
  spacingLine.setAttribute("x2", holeX + 20);
  spacingLine.setAttribute("y2", secondHole);
  spacingLine.setAttribute("stroke","#007acc");
  svg.appendChild(spacingLine);

  // קווים מקשרים
  const dash1 = document.createElementNS("http://www.w3.org/2000/svg","line");
  dash1.setAttribute("x1", holeX);
  dash1.setAttribute("y1", firstHole);
  dash1.setAttribute("x2", holeX + 25);
  dash1.setAttribute("y2", firstHole);
  dash1.setAttribute("stroke","#007acc");
  dash1.setAttribute("stroke-dasharray","2,2");
  svg.appendChild(dash1);

  const dash2 = document.createElementNS("http://www.w3.org/2000/svg","line");
  dash2.setAttribute("x1", holeX);
  dash2.setAttribute("y1", secondHole);
  dash2.setAttribute("x2", holeX + 25);
  dash2.setAttribute("y2", secondHole);
  dash2.setAttribute("stroke","#007acc");
  dash2.setAttribute("stroke-dasharray","2,2");
  svg.appendChild(dash2);

  const spacingText = document.createElementNS("http://www.w3.org/2000/svg","text");
  spacingText.setAttribute("x", holeX + 35);
  spacingText.setAttribute("y", firstHole + 16 + 5);
  spacingText.setAttribute("text-anchor","middle");
  spacingText.setAttribute("class", "dim-text");
  spacingText.textContent = holeSpacing;
  svg.appendChild(spacingText);
  
  
  // ===== קו מידה מרחק קידוח עליון =====
const topDimX = offsetX + width + 30; // מיקום הקו מימין למלבן
const firstHoleY = offsetY + topDistance;

// קו אנכי שמראה את המרחק
const topLine = document.createElementNS("http://www.w3.org/2000/svg","line");
topLine.setAttribute("x1", topDimX);
topLine.setAttribute("y1", offsetY);
topLine.setAttribute("x2", topDimX);
topLine.setAttribute("y2", firstHoleY);
topLine.setAttribute("stroke","#007acc");
svg.appendChild(topLine);

// קווים אנכיים קטנים בקצוות
const topEnd1 = document.createElementNS("http://www.w3.org/2000/svg","line");
topEnd1.setAttribute("x1", topDimX-5);
topEnd1.setAttribute("y1", offsetY);
topEnd1.setAttribute("x2", topDimX+5);
topEnd1.setAttribute("y2", offsetY);
topEnd1.setAttribute("stroke","#007acc");
svg.appendChild(topEnd1);

const topEnd2 = document.createElementNS("http://www.w3.org/2000/svg","line");
topEnd2.setAttribute("x1", topDimX-5);
topEnd2.setAttribute("y1", firstHoleY);
topEnd2.setAttribute("x2", topDimX+5);
topEnd2.setAttribute("y2", firstHoleY);
topEnd2.setAttribute("stroke","#007acc");
svg.appendChild(topEnd2);

// טקסט עם המרחק
const topText = document.createElementNS("http://www.w3.org/2000/svg","text");
topText.setAttribute("x", topDimX + 12);
topText.setAttribute("y", offsetY + topDistance/2 + 5);
topText.setAttribute("transform", `rotate(-90, ${topDimX + 12}, ${offsetY + topDistance/2})`);
topText.setAttribute("text-anchor","middle");
topText.setAttribute("class", "dim-text");
topText.textContent = topDistance;
svg.appendChild(topText);

expandViewBoxToContent(svg); // ⬅️ הוסף את השורה הזו

}

    document.getElementById('calcBtn').addEventListener('click', drawSVG);


    drawSVG();
	
	
const downloadBtn = document.getElementById('downloadBtn');
if (downloadBtn) {
    downloadBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { await downloadPdf(); }
        catch (err) {
            console.error('[downloadPdf] failed:', err);
            alert('אירעה שגיאה בייצוא PDF. ראה קונסול.');
        }
    });
}