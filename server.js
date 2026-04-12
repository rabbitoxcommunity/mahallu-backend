require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");

const app = express();

connectDB();

app.use(cors());
app.use(express.json());

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/family", require("./routes/familyRoutes"));
app.use("/api/house", require("./routes/houseRoutes"));
app.use("/api/member", require("./routes/memberRoutes"));

app.listen(5005, () => console.log("Server running on port 5005"));