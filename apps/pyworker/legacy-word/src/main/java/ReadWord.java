import java.nio.charset.StandardCharsets;
import org.apache.poi.hwpf.extractor.WordExtractor;

public final class ReadWord {
    private ReadWord() {}

    public static void main(String[] args) throws Exception {
        var output = System.out;
        System.setOut(System.err);
        try (var document = new WordExtractor(System.in)) {
            var body = document.getDocument().getRange();
            var text = new StringBuilder(document.getHeaderText());
            for (int i = 0; i < body.numParagraphs(); i++) {
                var paragraph = body.getParagraph(i);
                if (i > 0 && paragraph.pageBreakBefore()
                        && !body.getParagraph(i - 1).text().contains("\f")) {
                    text.append('\f');
                }
                text.append(WordExtractor.stripFields(paragraph.text())
                        .replace('\u0007', '\n').replace('\r', '\n').replace('\u000b', '\n'));
            }
            for (var story : new String[][] {document.getMainTextboxText(), document.getFootnoteText(),
                    document.getEndnoteText(), document.getCommentsText()}) {
                for (var paragraph : story) {
                    text.append('\n').append(paragraph);
                }
            }
            text.append('\n').append(document.getFooterText());
            if (text.length() > 140_000) {
                throw new IllegalArgumentException("Document exceeds the text limit");
            }
            output.write(text.toString().getBytes(StandardCharsets.UTF_8));
        }
    }
}
