# Medicine Help Portal

## Run locally

Install dependencies in the root, backend, and frontend directories, then run `npm run dev` from the project root. The frontend uses Vite; the API and MongoDB default to `http://localhost:5000` and `mongodb://127.0.0.1:27017/medicineHelpPortal`.

Accounts can be registered with a phone number from the portal. Ten-digit Indian mobile numbers and international numbers with a country code are supported. Each account has its own medicines, patient profile, and medical reports. Passwords are stored as bcrypt hashes and login sessions use HTTP-only cookies.

## Production configuration

Set `MONGODB_URI`, a unique random `JWT_SECRET` (at least 32 random bytes), and comma-separated `FRONTEND_ORIGINS` in the backend environment. Production startup intentionally fails if `JWT_SECRET` is missing. Never commit `.env` files. See `backend/.env.example` for variable names.

Medical report uploads accept PDF, JPEG, and PNG files up to 10 MB and are stored in MongoDB under the owning account. Existing medicines or patient records without an account owner are not exposed to registered accounts; assign them to an account only after confirming their owner.
