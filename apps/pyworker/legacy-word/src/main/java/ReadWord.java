import java.nio.charset.StandardCharsets;
import org.apache.poi.hwpf.extractor.WordExtractor;

public final class ReadWord {
    private ReadWord() {}

    public static void main(String[] args) throws Exception {
        try (var document = new WordExtractor(System.in)) {
            var text = document.getText();
            if (text.length() > 140_000) {
                throw new IllegalArgumentException("Document exceeds the text limit");
            }
            System.out.write(text.getBytes(StandardCharsets.UTF_8));
        }
    }
}
