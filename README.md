<div align="center">

# Transformo

### Shape every file. Keep every detail.

**A calm, layout-aware workspace for documents, languages, and video.**

[Explore the experience](#-the-experience) · [Get started](#-getting-started) · [Roadmap](#-where-transformo-can-go)

<br />

![Transformo workspace preview](assets/preview.svg)

<br />

![Status](https://img.shields.io/badge/status-early%20prototype-9b8bdf?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-8cdec7?style=flat-square)
![Built with](https://img.shields.io/badge/built%20with-HTML%20%7C%20CSS%20%7C%20JavaScript-a9a0ee?style=flat-square)

</div>

---

## ✦ The idea

Documents and videos are more than files. They are carefully arranged ideas. Transformo brings everyday file work into one considered space, with a special focus on the detail most tools overlook: **the position of the content**.

Translate a page and its text should stay in place. Edit a paragraph and the rest of the layout should remain composed. Move from a document to a video project without starting over in an entirely different-feeling tool.

Transformo is a local-first web workspace for common document operations and a first cut at the video studio.

## Design direction

Document tools open in a dedicated page workspace, with the file and its preview kept in view through the operation. Tool discovery follows the clear task groupings used by [iLovePDF](https://www.ilovepdf.com/), while the interface uses layered, translucent surfaces informed by [Apple's Human Interface Guidelines for materials](https://developer.apple.com/design/human-interface-guidelines/materials).

## ✨ The experience

| Workspace | What it is for |
| --- | --- |
| **Documents** | Keep uploaded files in a device-local workspace, then merge PDFs in a reorderable file queue, select page thumbnails or enter ranges to split, reorder/rotate/remove PDF pages, add watermarks or page numbers, compress PDFs with quality presets, convert PDFs to editable Word text, plain text, PNG, or JPG, preview DOCX pages before creating a visual PDF or exporting PNG/JPG page images, extract Word paragraphs/lists/tables and PowerPoint slide text, export XLSX worksheets to CSV, combine images into PDF, or paginate text files as PDF. Tools open in a full-page workspace. |
| **Layout-aware editing and translation** | Work from full-page PDF or rendered Word previews. Edit PDF text fields or DOCX paragraphs directly over their original page positions; undo or redo either editor's changes, reset to the source text, and download an editable DOCX or a visual PDF. Translate Word documents to an editable DOCX or image-backed PDF while retaining paragraph structure and source styles where possible. Undo or restore a translation, or keep up to three recent language-pair results in the current session and switch between them without translating again. OCR scanned PDFs in an expandable set of languages, translate related text blocks on-device first, or choose an optional DeepL online fallback after consent. Compare matching original and translated PDF pages side by side and export a layout-aware PDF. The language choices use compact buttons rather than dropdowns; translated Arabic and Hebrew blocks are laid out right-to-left. |
| **Video studio** | Edit directly in the video page: add multiple local clips, set each clip’s in/out points, reorder or remove clips on a timeline, choose hard cuts or fade-through-black transitions, select classic, glass, or outlined captions, import and edit SRT captions, choose source and target languages with buttons, translate timed subtitle cues with local-first or consent-based DeepL options, preview them in place, burn them into an MP4 export when the browser supports it or WebM otherwise, and export the subtitle track separately. Save named edit projects locally to reopen clip order, trims, transitions, caption style, subtitle cues, and their source/target language pair later. |

### Small details, big difference

- **A workspace that feels like one place.** A translucent, layered interface, soft color, and restrained motion give the tools room to breathe.
- **A quick way in.** Drag files into the workspace, browse for them, or use focused action cards for conversion, merging, and page tasks. Conversion choices are cards that match the selected file type, and merge files can be reordered before combining.
- **Search that moves with you.** Find recent files and jump straight into a tool with `⌘ K` (or `Ctrl K`).
- **Responsive by design.** The desktop sidebar becomes a compact navigation rail, then a bottom bar on small screens.
- **Reduced-motion support.** Interface animation respects the operating system preference.

## 🚀 Getting started

Transformo is a static web app: no package manager or build step is required for its local workflows. The app loads PDF.js, pdf-lib, Fontkit, JSZip, docx-preview, html2canvas, and Tesseract.js from public CDNs. Start it from a local web server so browser file APIs, OCR workers, and the optional on-device Translator API can run:

```bash
git clone https://github.com/KESHAVAPANDI/transformoDocs.git
cd transformoDocs
```

Then open `http://localhost:8000` in a recent Chrome or Edge browser. You can also use VS Code's Live Server extension.

```bash
python -m http.server 8000
```

Run the unit tests with Node.js, without installing packages:

```bash
node --test tests/*.test.cjs
```

Internet access is needed to load the conversion and PDF libraries. By default, selected documents and videos are processed in the browser tab and are not posted to a Transformo server.

### Optional online translation

On-device translation is the default. To enable the optional DeepL fallback, create a DeepL API key and run the small local bridge in a second terminal. The bridge binds only to `127.0.0.1`, keeps the API key in the server process, accepts requests only from local Transformo pages, and sends text blocks to DeepL only after you choose online translation and check the consent box. It does not log text or keys.

```powershell
$secureKey = Read-Host "DeepL API key" -AsSecureString
$env:DEEPL_API_KEY = [System.Net.NetworkCredential]::new("", $secureKey).Password
# Optional: set this only if your DeepL account specifies a different API endpoint.
# $env:DEEPL_API_URL = "https://api-free.deepl.com/v2/translate"
node translate-proxy.mjs
Remove-Item Env:DEEPL_API_KEY
```

The bridge requires Node.js 18 or newer. Enter the key at the prompt; do not put it in a command, source file, or public deployment.

DeepL's current Developer API plan includes a free one-time allowance of 1,000,000 characters; it does not renew. DeepL's legacy API Free plan offers a monthly quota but is no longer available for new subscriptions. The bridge selects the free endpoint for legacy keys ending in `:fx`, otherwise it uses DeepL's standard endpoint; set `DEEPL_API_URL` if your account shows a different endpoint. Check your plan before use. Online translation sends selected text blocks to DeepL and is subject to that plan's terms and data handling. See [DeepL API plans](https://support.deepl.com/hc/en-us/articles/360021200939-DeepL-API-plans), [API usage and limits](https://support.deepl.com/hc/en-us/articles/360020685720-Usage-count-and-billing-in-DeepL-API), and [DeepL's browser CORS guidance](https://developers.deepl.com/docs/best-practices/cors-requests).

PDF compression is an image-based option for visual fidelity: it redraws each page as a JPEG, so the exported file does not keep searchable text, links, or form fields. Some source PDFs may not shrink; in that case Transformo keeps the original and suggests trying the compact preset.

## 🧭 Where Transformo can go

The next step is to expand format coverage and make the layout-aware workflows more robust. A practical path could look like this:

1. **Expand Office editing.** Extend edit history and finer style preservation across PDF, PPTX, and spreadsheet workflows while retaining native text, styles, and structures.
2. **Improve layout translation.** The current PDF workflow uses positioned text lines and marks up the same page coordinates. Add paragraph context, font matching, non-white background handling, and an overflow review before export.
3. **Extend reversible editing.** Add structured change records and a clear before/after comparison across editing workflows.
4. **Improve OCR for scans.** Add confidence scores, better rotation and column handling, and an in-app review step before edits or translation.
5. **Grow the video studio.** Add subtitle styling, cross-dissolve transitions, and a wider range of export formats.
6. **Keep privacy visible.** Prefer local processing where practical, explain when a task needs a server, and make file retention clear.

For layout-preserving translation, **“preserve positions” should mean preserving each text block’s anchor and page geometry, then adapting font size or line breaks inside that block**. Some translations are longer than their source; the product should surface those collisions for a human to resolve.

## 🧱 Project structure

```text
transformoDocs/
├── index.html          # Workspace and editor views
├── styles.css          # Glass interface, responsive layout, and motion
├── operations.css      # Document/video editor styles
├── video.css           # Video editing controls
├── edit-history.js     # Shared bounded undo/redo snapshots for text editors
├── docx-text-mapping.js # Match rendered Word paragraphs to source document order
├── searchable-font.js   # Choose Unicode font subsets from translated text scripts
├── tests/
│   └── *.test.cjs        # Node built-in tests for editor/export helpers
├── app.js              # App navigation and task workflows
├── document-engine.js  # In-browser PDF and image/text conversion
├── translate-proxy.mjs # Optional local DeepL bridge for consent-based cloud fallback
├── ocr.css             # OCR controls
├── workspace-store.js  # Device-local file shelf and video projects backed by IndexedDB
├── workspace.css       # Saved-file selection and workspace controls
├── feedback.css        # Toast feedback above dialogs
├── tool-workspace.css  # Full-page document tools and page previews
├── video-export-format.js # Browser-supported MP4/WebM recorder selection
├── video-transition.js   # Timeline-safe transition opacity calculations
├── video-caption-style.js # Shared caption presets for preview and export
├── video-engine.js     # Local multi-clip projects, trim, captions, SRT, and video export
├── assets/preview.svg  # README workspace illustration
└── README.md           # Setup, features, limits, and roadmap
```

## 🛠 Current prototype boundaries

PDF merge, visual page selection, page organization, watermarks, page numbers, image/text conversion, PDF-to-DOCX/text/PNG/JPG export, positioned block editing/translation, OCR for image-only PDF pages, and multi-clip video timeline export are implemented in the browser. OCR language data is downloaded on demand and recognition runs locally. There are deliberate limits:

- PDF editing and translation exports keep a rendered page as the visible layer and add an invisible, embedded Unicode text layer for search and copy. Script-specific font subsets load from Google Fonts on demand; if a subset is unavailable, the image-backed PDF still exports and reports text characters that could not be indexed. OCR text remains approximate and should be reviewed. DOCX editing can export a native `.docx` by matching edited body paragraphs back to their original text; text is replaced inside the original paragraph structure and the first run's styling is reused where possible. Unmatched paragraphs stay unchanged and are counted in the completion message. DOCX-to-PDF and DOCX-to-image conversions use browser-rendered pages, so results can differ from Microsoft Word's layout.
- PDF-to-Word creates editable text paragraphs from selectable PDF text, carrying over approximate horizontal positions, vertical spacing, font sizes, and page breaks. This is a practical layout approximation; it does not rebuild columns, tables, embedded fonts, or exact styling. Scanned pages need OCR first.
- Page organizing previews up to 80 pages at a time. Pages beyond the preview remain in their original order after the visible pages.
- Page selection for splitting previews up to 80 pages. Enter a page range to extract later pages.
- Translation previews show up to 24 pages at a time; every page is included in the exported PDF. The in-page editor previews up to 80 pages.
- Replacement text uses a neutral dark font rather than preserving every source font and color. Translated blocks wrap within the original block area, shrink when needed, and are flagged if they still overflow.
- OCR can misread low-quality scans, handwriting, rotated text, and complex layouts. Review recognized text before translating or exporting.
- Translation defaults to the browser's built-in Translator API, when available. Transformo shows model readiness before starting and reports first-use model download progress. Chrome documents this API for desktop use; other browsers and language pairs vary. Smart mode tries on-device first and only falls back online after the user enables the DeepL consent checkbox; users can also choose on-device only or online only. The optional bridge requires a user-provided DeepL API key. New DeepL API Developer accounts include 1 million free characters total (not monthly); the legacy monthly Free plan is no longer available to new subscribers. Check your account plan because other API plans can be paid. Document text leaves the browser only after the explicit consent choice. See [Chrome's Translator API documentation](https://developer.chrome.com/docs/ai/translator-api/) and the DeepL links above.
- The language picker follows Chrome's documented language-code list; availability still depends on the browser and selected pair.
- Replacement covers sample their nearby page color, which works for many tinted regions. Gradients, photographs, columns, and rotated text still need careful review.
- Video export joins trimmed timeline clips into a sequence with timed, styled subtitles and audio where the browser supports media capture. Choose classic, glass, or outlined captions and preview the selected appearance before export. Transformo prefers MP4 when MediaRecorder reports an available MP4 codec and falls back to WebM; actual browser and codec support varies. Choose hard cuts or fade-through-black transitions; the fade uses each clip’s existing edge time, so it does not change cue timing or total duration. Cross-dissolve transitions are not implemented. SRT import accepts numbered cues with standard hours:minutes:seconds,milliseconds timestamps; cue times are measured against the combined timeline, and cues outside its duration are omitted from export. Subtitle translation uses the same local-first, consent-based DeepL option as document translation and translates from English.
- PDF text edits and DOCX paragraph edits support undo, redo, and reset during the current editor session. Translation results have a one-step undo/redo, and up to three recent language-pair results are kept in memory for the currently open document; they are not saved across a reload. Changing the language pair returns to source text before another translation starts. DOCX editing, translation, and DOCX-to-PDF use browser-rendered page previews. Translated DOCX output replaces matched paragraph text in the original package and reuses the first run's styling where possible; longer translations can reflow in Word and unmatched paragraphs are reported. PDF translation output remains image-backed for visual fidelity. DOCX-to-text and PPTX-to-text extract content without preserving document/slide layout or styling. XLSX-to-CSV exports worksheet values, not cell formatting; formula cells use saved values. Native Word structure editing, PPTX editing, and spreadsheet editing are not implemented.
- Files and saved video projects are persisted in this browser profile with IndexedDB. They stay on the device, but browser storage can be cleared by the user or browser; large video files may exceed available quota. Video projects refer to source clips in the local workspace, and Transformo prevents removing a clip while a saved project still uses it. Save changes manually; unsaved edits trigger a leave/reload warning. Static PDF/OCR libraries, OCR language data, and Noto font subsets are fetched from CDNs. Font requests identify the requested font family, not the document text.

## 💡 More ideas worth exploring

- **Layout confidence map:** highlight translated text blocks that fit comfortably, need smaller type, or require a human decision.
- **Parallel language pages:** compare source and translated pages side by side, with linked selections.
- **Glossary and tone memory:** keep product names, recurring terms, and preferred voice consistent across a project.
- **Document-to-video bridge:** turn a translated brief or presentation into a captioned video draft.
- **Batch recipes:** save a repeatable chain such as “translate to Spanish → export PDF → compress”.
- **Accessible output checks:** catch reading-order, contrast, caption, and document-tagging issues before export.

## 🤝 Contributing

Ideas, accessibility feedback, and thoughtful improvements are welcome. Open an issue to discuss a larger change before sending a pull request.

## 📄 License

This project is released under the MIT License. See [LICENSE](LICENSE).

Transformo fetches Noto font subsets for Unicode PDF text layers from [Google Fonts](https://github.com/google/fonts). Noto font families are distributed under the [SIL Open Font License 1.1](https://github.com/google/fonts/blob/main/ofl/notosans/OFL.txt).

<div align="center">
<br />
<sub>Made for the way you think. Built to keep the details in place.</sub>
</div>
