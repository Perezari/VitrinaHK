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
const PRINT_ALIGN = 'center'; // 'left' | 'center'

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

            const fixedValue = (label === 'מספר יחידה'
                || label === 'הכנה עבור'
                || label === 'גוון פרופיל'
                || label === 'מספר תוכנית'
                || label === 'סוג זכוכית')
                ? value
                : fixHebrew(value);

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

        function addLogo(pdf) {
            const supplier = unitDetails.Sapak;
            const logo = ProfileConfig.getLogoBySupplier(supplier);
            if (!supplier || !logo) return;

            const logoWidth = 25;
            const logoHeight = 25;
            pdf.addImage(logo, "PNG", 10, 10, logoWidth, logoHeight);
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
    const profileType = document.getElementById('profileType').selectedOptions[0].text;
    const settings = ProfileConfig.getProfileSettings(profileType);

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

const sapakSelect = document.getElementById("Sapak");
const profileSelect = document.getElementById("profileType");
const frontW = document.getElementById("frontW");
const cabH = document.getElementById("cabH");
const topDistance = document.getElementById("topDistance");
const holeDiameter = document.getElementById("holeDiameter");
const rightInset = document.getElementById("rightInset");
const leftInset = document.getElementById("leftInset");
const unitContainer = document.getElementById("unitNum").parentElement;

let unitNumInput = document.getElementById("unitNum"); // משתנה שמצביע כרגע ל-input
let excelRows = []; // נשמור כאן את הנתונים מהקובץ

// פונקציה למילוי profileType
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

    // אחרי שמילאנו מחדש – נעדכן גם את השרטוט
    drawSVG();
}

// מילוי בפעם הראשונה לפי הספק שנבחר כבר
fillProfileOptions();

// מאזין לשינוי בספק
sapakSelect.addEventListener("change", fillProfileOptions);
sapakSelect.addEventListener("change", drawSVG);
profileSelect.addEventListener("change", drawSVG);
frontW.addEventListener("change", drawSVG);
cabH.addEventListener("change", drawSVG);
topDistance.addEventListener("change", drawSVG);
holeDiameter.addEventListener("change", drawSVG);
rightInset.addEventListener("change", drawSVG);
leftInset.addEventListener("change", drawSVG);

// טעינת קובץ Excel
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

        // range: 6 => להתחיל מהשורה 7 (B7) שבה יש כותרות
        excelRows = XLSX.utils.sheet_to_json(sheet, { range: 6 });

        console.log("עמודות שהתקבלו:", Object.keys(excelRows[0]));
        console.log("דוגמה לשורה ראשונה:", excelRows[0]);

        // הפיכת השדה unitNum לרשימה נפתחת אם הוא עדיין input
        if (unitNumInput.tagName.toLowerCase() === "input") {
            const select = document.createElement("select");
            select.id = "unitNum";

            // מספרי היחידות מהקובץ, מסוננים
            const units = [...new Set(
                excelRows
                    .map(r => String(r['יחידה']).trim())
                    .filter(u => u && u !== "undefined")
            )];

            units.forEach((unit, index) => {
                const option = document.createElement("option");
                option.value = unit;
                option.textContent = unit;
                select.appendChild(option);

                // בחר אוטומטית את הערך הראשון
                if (index === 0) select.value = unit;
            });

            // מחליפים את השדה ב-DOM
            unitContainer.replaceChild(select, unitNumInput);
            unitNumInput = select;
        }

        // מאזינים לשינוי ברשימה
        unitNumInput.addEventListener("change", function () {
            searchUnit(this.value);
        });

        // ניסיון ראשוני אם כבר יש מספר יחידה בשדה
        searchUnit(unitNumInput.value);
    };
    reader.readAsArrayBuffer(file);
});

// חיפוש שורה לפי מספר יחידה
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

    // סוג חומר -> גוון + סוג פרופיל
    if (row['סוג החומר']) {
        const [color, type] = row['סוג החומר'].split('_');
        document.getElementById('profileColor').value = color || '';

        // חיפוש ספק לפי סוג הפרופיל
        let foundSupplier = null;
        for (const supplier in ProfileConfig.SUPPLIERS_PROFILES_MAP) {
            if (ProfileConfig.SUPPLIERS_PROFILES_MAP[supplier].includes(type)) {
                foundSupplier = supplier;
                break;
            }
        }

        if (foundSupplier) {
            // עדכון הספק בשדה עם שם בעברית
            sapakSelect.value = foundSupplier;
            fillProfileOptions(); // עדכון הרשימה בהתאם לספק
        }

        profileSelect.value = type || '';
    }

    if (row['מלואה']) {
        document.getElementById('glassModel').value = row['מלואה'];
    }

    drawSVG();
}

// חיפוש בלייב כשכותבים בשדה יחידה
unitNumInput.addEventListener("input", function () {
    searchUnit(this.value);
});

const batchSaveBtn = document.getElementById("batchSaveBtn");

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
    setTimeout(() => {
        overlay.style.display = 'none';
    }, 3000); // 3 שניות לפני הסתרה
}

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
        const hk = "HK_TOP";

        // עדכון שדות כמו קודם
        frontW.value = row['רוחב'] || '';
        cabH.value = row['אורך'] || '';
        document.getElementById('partName').value = partName;

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

function generatePDFForUnit(unitNumber) {
    // הפונקציה שלך שמייצרת PDF על פי הערכים הנוכחיים בשדות
    drawSVG(); // אם צריך לעדכן את השרטוט לפני ההורדה
    // כאן הקוד ליצירת PDF והורדתו
    downloadPdf();
}

const excelFileInput = document.getElementById('excelFile');
const fileNameSpan = document.querySelector('.file-name');

excelFileInput.addEventListener('change', () => {
    if (excelFileInput.files.length > 0) {
        fileNameSpan.textContent = excelFileInput.files[0].name;
    } else {
        fileNameSpan.textContent = "לא נבחר קובץ";
    }
});

// הפעלה ראשונית
drawSVG();