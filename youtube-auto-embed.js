class YoutubeAutoEmbed {
  async invoke() {
    const { MarkdownView } = require("obsidian");

    const YT_REGEX =
      /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;

    const getEditor = () =>
      app.workspace.getActiveViewOfType(MarkdownView)?.editor || null;

    const convert = () => {
      const ed = getEditor();
      if (!ed) return;

      const doc = ed.getValue();
      if (!doc) return;

      // evita converter embeds já existentes
      if (doc.includes("<iframe") && doc.includes("youtube.com/embed")) return;

      let changed = false;

      const out = doc.replace(YT_REGEX, (m, id) => {
        changed = true;
        return `<iframe
  width="100%"
  height="360"
  src="https://www.youtube.com/embed/${id}"
  frameborder="0"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  allowfullscreen>
</iframe>`;
      });

      if (changed) {
        ed.setValue(out);
      }
    };

    // observa mudanças no editor
    document.addEventListener("keyup", () => {
      // pequeno delay pra garantir que o paste terminou
      setTimeout(convert, 50);
    });
  }
}
