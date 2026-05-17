public class SwallowedExceptionSample {
    public void refresh(String value) {
        try {
            Integer.parseInt(value);
        } catch (NumberFormatException ex) {
        }
    }
}
