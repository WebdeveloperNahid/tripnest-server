import express, { Request, Response } from "express";
import { Collection, MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
console.log("Starting server...");

const app = express();
const port = 7000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
const uri = process.env.MONGO_DB_URI as string;
const client = new MongoClient(uri);

let addTourCollection!: Collection;

async function connectToMongoDB() {
  try {
    await client.connect();

    const database = client.db("tripnest");
    addTourCollection = database.collection("add-tours");

    console.log("You successfully connected to MongoDB!");
  } catch (err) {
    console.dir(err);
  }
}

// Routes
app.get("/", (req: Request, res: Response) => {
  res.send("Hello World!");
});
//----------------------------------

//Post __AddTour  
app.post("/api/add-tours", async (req: Request, res: Response) => {
  const tour = req.body;
  const result = await addTourCollection.insertOne(tour);
  res.send(result);
});

// Get -AddedTours data ... ///---->>> Has SomeChangees -After added [filter by Srarch & pagination] __--,,
app.get("/api/add-tours", async (req: Request, res: Response) => {
   const { search, category, minPrice, maxPrice, sort } = req.query as Record<string, string>;
   const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 8;

   const query: Record<string, unknown> = {};
  if (search) query.$or = [{ title: { $regex: search, $options: "i" } }, { destination: { $regex: search, $options: "i" } }];
  if (category && category !== "All") query.category = category;
  if (minPrice || maxPrice) query.price = { ...(minPrice && { $gte: +minPrice }), ...(maxPrice && { $lte: +maxPrice }) };

   const sortMap: Record<string, Record<string, 1 | -1>> = {
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    rating: { rating: -1 },
  };
   const sortOption = sortMap[sort] || { _id: -1 };

   const total = await addTourCollection.countDocuments(query);
   
  const tours = await addTourCollection.find(query).sort(sortOption).skip((page - 1) * limit).limit(limit).toArray();
  res.send({ tours, total, page, totalPages: Math.ceil(total / limit) });
});


// Get -- Latest 6 Tours (for Home page "Latest Tours" section)
app.get("/api/add-tours/latest", async (req: Request, res: Response) => {
  
    const tours = await addTourCollection
      .find()
      .sort({ _id: -1 })
      .limit(6)
      .toArray();
 
    res.send(tours);
});
 


// Get -AddedTours Detaislpage ByID ...
app.get("/api/add-tours/:id", async (req: Request, res: Response) => {
  const id = req.params.id as string;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ error: "Invalid tour ID" });
  }
  const tour = await addTourCollection.findOne({ _id: new ObjectId(id) });
  res.send(tour);

  if (!tour) {
    return res.status(404).send({ error: "Tour not found" });
  }
  res.send(tour);

});



//-----------------------------------
connectToMongoDB().then(() => {
  app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
  });
});
