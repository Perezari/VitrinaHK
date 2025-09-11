# HK TOP Front Vitrina Configurator 📐

![Language](https://img.shields.io/badge/language-JavaScript-yellow.svg)
![Frontend](https://img.shields.io/badge/frontend-HTML%2FCSS-orange.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

A client-side web application designed to automate the generation of technical detail drawings for HK TOP front panels. This tool allows users to input specific dimensions and profile settings, visualize the drawing in real-time, and export it as a PDF. It also supports batch processing by importing data from Excel files, making it highly efficient for manufacturers and designers dealing with various cabinet configurations.

## ✨ Features

*   **Dynamic Drawing Generation:** Real-time SVG rendering of HK TOP front panel technical drawings based on user inputs.
*   **Customizable Dimensions:** Easily adjust front width, cabinet height, drilling distances (top, left, right), and hole diameter.
*   **Profile Management:** Select from a variety of predefined profiles (e.g., קואדרו, זירו, ג'נסיס, דגם424) and suppliers (e.g., Bluran, Nilsen, Avivi), each with unique settings (e.g., `padSides`, `hasGerong`).
*   **Excel Data Import:** Upload `.xls` or `.xlsx` files to automatically populate unit details, dimensions, and profile information for single or batch processing.
*   **Single PDF Export:** Generate and download a PDF of the currently displayed drawing with all relevant details and logos.
*   **Batch PDF Export:** Process multiple units from an imported Excel file and download individual PDF drawings for each.
*   **Hebrew Language Support:** Full support for Hebrew text and RTL layout in the UI and exported PDF documents, including custom font embedding (`Alef`).
*   **Supplier Logo Integration:** Automatically includes the selected supplier's logo in the generated PDF.

## 📚 Tech Stack

*   **HTML5:** For structuring the web application.
*   **CSS3:** For styling and responsive design, including custom fonts (`Rubik`).
*   **JavaScript (Vanilla):** Powers all interactive elements, dynamic drawing, data processing, and PDF generation.
*   **[SheetJS js-xlsx](https://sheetjs.com/):** Used for parsing and processing Excel files.
*   **[jsPDF](https://raw.githack.com/MrRio/jsPDF/master/docs/jsPDF.html):** The core library for generating PDF documents from HTML/JavaScript.
*   **[svg2pdf.js](https://cdn.jsdelivr.net/npm/svg2pdf.js@2.5.0/dist/svg2pdf.umd.min.js):** A plugin for jsPDF to convert SVG elements directly into PDF vector graphics.

## 🚀 Installation

This project is a client-side web application and does not require any server-side setup or dependencies beyond a modern web browser.

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/VitrinaHK.git
    cd VitrinaHK
    ```
2.  **Open in Browser:**
    Simply open the `VitrinaHK/index.html` file in your preferred web browser (e.g., Chrome, Firefox, Edge).

## ▶️ Usage

1.  **Open the Application:** Navigate to `index.html` in your web browser.
2.  **Input Parameters:**
    *   Manually enter the desired **Front Width** and **Cabinet Height**.
    *   Adjust **Drilling** parameters: Top Distance, Hole Diameter, Right Inset, Left Inset.
    *   Fill in **Unit Details** such as `הזמנה עבור` (Order For - supplier), `מספר תוכנית` (Plan Number), `מספר יחידה` (Unit Number), `שם מפרק` (Part Name), `סוג פרופיל` (Profile Type), `גוון פרופיל` (Profile Color), `דגם זכוכית` (Glass Model), `כיוון טקסטורת זכוכית` (Glass Texture Direction), and `כולל הכנה עבור` (Prepared For).
3.  **Upload Excel File (Optional):**
    *   Click the "..." button next to "הזן מידות וקבל שרטוט טכני באופן אוטומטי" to upload an Excel file (`.xls` or `.xlsx`).
    *   The application will attempt to parse the file and use relevant data to pre-fill the form fields and enable batch processing.
    *   **Note:** The Excel file should contain columns such as `יחידה`, `רוחב`, `אורך`, `שם החלק`, `סוג החומר`, `מלואה` for optimal functionality.
4.  **Dynamic Drawing:** Observe the SVG drawing on the right panel update in real-time as you change the input values.
5.  **Export to PDF:**
    *   Click "הורד PDF 💾" (Download PDF) to generate and download a PDF of the currently displayed drawing.
    *   Click "PDF BATCH 💾" to generate and download PDFs for all applicable units found in an uploaded Excel file.

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## 📝 License

Distributed under the MIT License. See the `LICENSE` file for more information.
