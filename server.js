require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const app = express();

connectDB();

app.use(cors());
app.use(express.json());

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/tenants", require("./routes/tenantRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/family", require("./routes/familyRoutes"));
app.use("/api/house", require("./routes/houseRoutes"));
app.use("/api/member", require("./routes/memberRoutes"));
app.use("/api/finance/varisankhya", require("./routes/varisankhyaRoutes"));

app.listen(5005, () => console.log("Server running on port 5005"));