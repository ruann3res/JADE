import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

public class SqlInjectionSample {
    private final Connection connection;

    public SqlInjectionSample(Connection connection) {
        this.connection = connection;
    }

    public ResultSet findUser(String name) throws SQLException {
        String sql = "SELECT * FROM users WHERE name = '" + name + "'";
        Statement statement = connection.createStatement();
        return statement.executeQuery(sql);
    }
}
