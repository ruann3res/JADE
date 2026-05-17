import java.io.BufferedReader;
import java.io.FileReader;
import java.io.IOException;

public class UnclosedResourceSample {
    public String firstLine(String file) throws IOException {
        BufferedReader reader = new BufferedReader(new FileReader(file));
        return reader.readLine();
    }
}
