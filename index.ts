import express, { NextFunction, Request, Response } from "express";
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
let userCollection!: Collection;      
let sessionCollection!: Collection;   

async function connectToMongoDB() {
  try {
    await client.connect();

    const database = client.db("tripnest");
    addTourCollection = database.collection("add-tours");

    userCollection = database.collection("user");      
    sessionCollection = database.collection("session"); 

    console.log("You successfully connected to MongoDB!");
  } catch (err) {
    console.dir(err);
  }
}

// Routes
app.get("/", (req: Request, res: Response) => {
  res.send("Hello World!");
});

// ---- Auth Middleware  ----
declare global {
  namespace Express {
    interface Request {
      user?: Record<string, unknown>;
    }
  }
}

const verifyToken = async (req: Request, res: Response, next: NextFunction) => {
  console.log("headers", req.headers);
  const authHeader = req.headers?.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(404).send({ message: "unauthorized access" });
  }
  const query = { token: token };
  const session = await sessionCollection.findOne(query);

  if (!session) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  const userId = session.userId;
  const userQuery = { _id: userId };
  const user = await userCollection.findOne(userQuery);
  console.log(userId, "usr id of the session ", user);

  if (!user) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  req.user = user;
  next();
};

const verifyUser = async (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role !== "user") {
    return res.status(403).send({ message: "forbidden access" });
  }
  next();
};

const verifyAdmin = async (req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role !== "admin") {
    return res.status(403).send({ message: "forbidden access" });
  }
  next();
};
// ---- Auth Middleware শেষ ----

// Routes
app.get("/", (req: Request, res: Response) => {
  res.send("Hello World!");
});
//----------------------------------

//----------------------------------
//Post __AddTour
app.post("/api/add-tours",verifyToken,verifyAdmin, async (req: Request, res: Response) => {
  const tour = req.body;
  const result = await addTourCollection.insertOne(tour);
  res.send(result);
});

// Get -AddedTours data ... ///---->>> Has SomeChangees -After added [filter by Srarch & pagination] __--,,
app.get("/api/add-tours",verifyToken,  async (req: Request, res: Response) => {
  const { search, category, minPrice, maxPrice, sort } = req.query as Record<
    string,
    string
  >;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 8;

  const query: Record<string, unknown> = {};
  if (search)
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { destination: { $regex: search, $options: "i" } },
    ];
  if (category && category !== "All") query.category = category;
  if (minPrice || maxPrice)
    query.price = {
      ...(minPrice && { $gte: +minPrice }),
      ...(maxPrice && { $lte: +maxPrice }),
    };

  const sortMap: Record<string, Record<string, 1 | -1>> = {
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    rating: { rating: -1 },
  };
  const sortOption = sortMap[sort] || { _id: -1 };

  const total = await addTourCollection.countDocuments(query);

  const tours = await addTourCollection
    .find(query)
    .sort(sortOption)
    .skip((page - 1) * limit)
    .limit(limit)
    .toArray();
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

// GET - শুধু নির্দিষ্ট user এর পোস্ট করা Tours (Manage Tours page এর জন্য)
// এই route /:id এর আগে থাকতেই হবে
app.get("/api/add-tours/user/:userId", async (req: Request, res: Response) => {
  const { userId } = req.params;
  const tours = await addTourCollection
    .find({ createdBy: userId })
    .sort({ _id: -1 })
    .toArray();
  res.send(tours);
});



//------------Sobar pore rakte hobe  /:id ke-----__-___-----
// Get -AddedTours Detaislpage ByID ...
app.get("/api/add-tours/:id",verifyToken,  async (req: Request, res: Response) => {
  const id = req.params.id as string;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ error: "Invalid tour ID" });
  }
  const tour = await addTourCollection.findOne({ _id: new ObjectId(id) });
  

  if (!tour) {
    return res.status(404).send({ error: "Tour not found" });
  }
  res.send(tour);
});

//---------------------
// PATCH - Update tour (শুধু owner পারবে)
app.patch("/api/add-tours/:id", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { userId, ...updateData } = req.body;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ error: "Invalid tour ID" });
  }

  const tour = await addTourCollection.findOne({ _id: new ObjectId(id) });

  if (!tour) {
    return res.status(404).send({ error: "Tour not found" });
  }

  if (tour.createdBy !== userId) {
    return res.status(403).send({ error: "You can only edit your own tours" });
  }

  const result = await addTourCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updateData }
  );

  res.send(result);
});

// DELETE - Delete tour (শুধু owner পারবে)
app.delete("/api/add-tours/:id", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const userId = req.query.userId as string;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ error: "Invalid tour ID" });
  }

  const tour = await addTourCollection.findOne({ _id: new ObjectId(id) });

  if (!tour) {
    return res.status(404).send({ error: "Tour not found" });
  }

  if (tour.createdBy !== userId) {
    return res.status(403).send({ error: "You can only delete your own tours" });
  }

  const result = await addTourCollection.deleteOne({ _id: new ObjectId(id) });

  res.send(result);
});

//-----------------------------------
if (process.env.NODE_ENV !== "production") {
  connectToMongoDB().then(() => {
    app.listen(port, () => {
      console.log(`Example app listening on port ${port}`);
    });
  });
} 

export default app;