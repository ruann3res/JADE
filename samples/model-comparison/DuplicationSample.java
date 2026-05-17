public class DuplicationSample {
    public int calculateBasic(int amount) {
        int tax = amount * 10 / 100;
        int fee = amount * 2 / 100;
        int total = amount + tax + fee;
        return total;
    }

    public int calculatePremium(int amount) {
        int tax = amount * 10 / 100;
        int fee = amount * 2 / 100;
        int total = amount + tax + fee;
        return total;
    }
}
