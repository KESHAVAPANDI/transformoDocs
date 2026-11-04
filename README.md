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

Transformo is an early, interactive product prototype that makes this direction tangible.

## ✨ The experience

| Workspace | What it is for |
| --- | --- |
| **Documents** | A home for your files, with quick paths to editing, conversion, merging, splitting, and translation. |
| **Layout-aware translation** | Choose source and target languages with a visible “layout lock” concept that keeps text blocks anchored to their original geometry. |
| **Video studio** | A companion space for footage, cuts, subtitles, audio polish, and future video translation. |
| **Activity** | A natural home for recent transformations and project history as the product grows. |

### Small details, big difference

- **A workspace that feels like one place.** A translucent, layered interface, soft color, and restrained motion give the tools room to breathe.
- **A quick way in.** Drag files into the workspace, browse for them, or use the tool cards to start a focused task.
- **Search that moves with you.** Find recent files and jump straight into a tool with `⌘ K` (or `Ctrl K`).
- **Responsive by design.** The desktop sidebar becomes a compact navigation rail, then a bottom bar on small screens.
- **Reduced-motion support.** Interface animation respects the operating system preference.

## 🚀 Getting started

Transformo is currently a static front-end prototype: no package manager or build step is required.

```bash
git clone https://github.com/KESHAVAPANDI/transformoDocs.git
cd transformoDocs
```

Open `index.html` in a browser, or start a small local server:

```bash
python -m http.server 8000
```

Then visit [http://localhost:8000](http://localhost:8000).

## 🧭 Where Transformo can go

The next step is to turn the visual promise into real, dependable document operations. A practical path could look like this:

1. **Build a file pipeline.** Add real PDF and Office format parsing, page previews, export, merge, and split operations.
2. **Preserve layout with structure.** Extract each page into positioned text and image blocks; translate text inside those blocks, measure the new content, and flag overflow for review instead of silently shifting the page.
3. **Make editing reversible.** Keep the source untouched, store edits as structured operations, and offer a clear before/after comparison with undo.
4. **Add OCR for scans.** Detect text and its bounding boxes on image-only pages before editing or translation.
5. **Grow the video studio.** Start with local video preview, timeline trims, subtitles, and export; add translated captions and dubbing as separate, reviewable tracks.
6. **Keep privacy visible.** Prefer local processing where practical, explain when a task needs a server, and make file retention clear.

For layout-preserving translation, **“preserve positions” should mean preserving each text block’s anchor and page geometry, then adapting font size or line breaks inside that block**. Some translations are longer than their source; the product should surface those collisions for a human to resolve.

## 🧱 Project structure

```text
transformoDocs/
├── index.html   # App structure and workspace views
├── styles.css   # Glass interface, responsive layout, and motion
├── app.js       # Prototype interactions and sample workspace data
└── README.md    # Project overview and direction
```

## 🛠 Current prototype boundaries

The current interface demonstrates the product direction and interactions. File selection and drag-and-drop populate the session’s recent-files list, and the tools open guided setup panels. **Document conversion, editing, translation, merging, splitting, and video export are not connected to processing engines yet.** Uploaded file contents are not sent to a server or persisted by this prototype.

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

<div align="center">
<br />
<sub>Made for the way you think. Built to keep the details in place.</sub>
</div>
