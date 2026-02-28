const express = require("express");
const mongoose = require("mongoose");
require("dotenv").config();

const app = express();

/* CONNECT TO MONGODB */
mongoose.connect(process.env.MONGO_URI)
.then(() => {
    console.log("✅ MongoDB Connected Successfully");
})
.catch(err => {
    console.log("❌ MongoDB Connection Failed");
    console.log(err.message);
});

/* TEST ROUTE */
app.get("/", (req,res)=>{
    res.send("Server running");
});

app.listen(process.env.PORT, ()=>{
    console.log("Server started on port " + process.env.PORT);
});