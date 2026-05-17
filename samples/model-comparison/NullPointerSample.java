public class NullPointerSample {
    public int normalizedLength(String input) {
        if (input.isEmpty()) {
            return 0;
        }
        return input.length();
    }
}
