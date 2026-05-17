public class ComplexitySample {
    public String classify(int score, boolean active, boolean overdue) {
        if (!active) {
            return "inactive";
        }
        if (overdue && score < 40) {
            return "blocked";
        }
        if (score > 90) {
            return "excellent";
        }
        if (score > 70) {
            return overdue ? "review" : "good";
        }
        if (score > 50) {
            return "average";
        }
        if (score > 20) {
            return overdue ? "risk" : "low";
        }
        return "critical";
    }
}
