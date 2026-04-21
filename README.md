eNX Portal Backend 🚀

Backend API for eNX Portal – Entry, Exit & Material Movement System.

🧠 Overview

This backend handles all server-side logic including:

- Authentication (Login system)
- Visitor Entry & Exit management
- Material Movement tracking
- WhatsApp API integration for e-Pass generation
- Database operations using MongoDB

---

🛠️ Tech Stack

- Node.js
- Express.js
- MongoDB
- Mongoose
- JWT Authentication
- Twilio / WhatsApp API

---

📁 Project Structure

server/
├── controllers/
├── models/
├── routes/
├── utils/
├── index.js
├── package.json

---

⚙️ Installation & Setup

1. Clone the repository:

git clone https://github.com/your-username/eNX-Portal-Backend.git

2. Install dependencies:

npm install

3. Create a ".env" file and add:

PORT=5000
MONGO_URI=your_mongodb_connection
JWT_SECRET=your_secret_key

4. Run the server:

npm start

---

🌐 API Base URL

After deployment (Render):

https://your-backend-url.onrender.com

---

🔐 Features

- Secure authentication using JWT
- RESTful APIs
- Modular folder structure
- Integration with WhatsApp for visitor pass

---

📌 Note

- Do not upload ".env" file (contains sensitive data)
- "node_modules" is ignored

---

👩‍💻 Author

Priyanshi Trivedi

---

📄 License

This project is for academic purposes.
