public class CodeSmellsLongMethod {

    public void runHeavyProcess(int seed) {
        System.out.println("inicio do processamento pesado");

        try {
            validateSeed(seed);
        } catch (IllegalArgumentException ex) {
        }

        int result = calculateResult(seed);
        System.out.println("resultado=" + result);
    }

    private int calculateResult(int seed) {
        int result = seed;

        for (int step = 1; step <= 41; step++) {
            result += step;
        }

        return result;
    }

    private void validateSeed(int seed) {
        if (seed < 0) {
            throw new IllegalArgumentException("seed nao pode ser negativo");
        }
    }
}
