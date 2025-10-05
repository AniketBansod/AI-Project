# AI-Powered Classroom

A comprehensive classroom management system with AI-powered plagiarism detection, built with Next.js and Express.

## Features

### Authentication
- Email/password registration and login
- Email verification system
- Google OAuth integration (optional)
- Role-based access control (Teacher/Student)

### Class Management
- Teachers can create and manage classes
- Students can join classes using unique join codes
- View enrolled students and class details
- Class-specific posts and announcements

### Assignment System
- Teachers can create assignments with deadlines and point values
- Students can submit assignments with text or file uploads
- Assignment listing with status tracking
- Deadline management and notifications

### Plagiarism Detection
- AI-powered plagiarism checking on submission
- Similarity scoring against other submissions
- AI-generated content detection
- Visual PDF highlighting of plagiarized sections
- Detailed plagiarism reports with metrics

### Submission Management
- File upload support (PDF, DOCX, TXT)
- Text-based submissions
- Grading system for teachers
- Submission history and tracking
- Download highlighted PDFs with plagiarism markers

### Communication
- Class posts for announcements
- Threaded comments on posts
- Submission-specific comments for feedback
- Real-time discussion threads

### PDF Viewer
- In-browser PDF viewing
- Zoom controls and page navigation
- Highlighted plagiarism sections with color-coded severity
- Download functionality for highlighted documents

## Tech Stack

### Frontend
- **Next.js 15** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS v4** - Utility-first styling
- **shadcn/ui** - Component library
- **React Hook Form** - Form management
- **Zod** - Schema validation

### Backend
- **Express.js** - REST API server
- **Prisma** - Database ORM
- **PostgreSQL** - Primary database
- **Redis** - Queue management with BullMQ
- **AWS S3** - File storage
- **JWT** - Authentication tokens
- **Nodemailer** - Email service

### AI/ML
- **Python FastAPI** - Plagiarism detection service
- **Sentence Transformers** - Text embedding
- **scikit-learn** - Similarity calculations
- **PyPDF2** - PDF text extraction

## Project Structure

\`\`\`
├── app/                          # Next.js app directory
│   ├── (auth)/                   # Authentication pages
│   │   ├── login/
│   │   ├── register/
│   │   └── verify-email/
│   ├── assignments/[id]/         # Assignment detail pages
│   ├── classes/[id]/             # Class detail pages
│   ├── dashboard/                # Main dashboard
│   ├── submissions/[id]/         # Submission detail pages
│   └── layout.tsx                # Root layout
├── components/                   # React components
│   ├── assignments/              # Assignment components
│   ├── auth/                     # Auth forms
│   ├── classes/                  # Class management
│   ├── dashboard/                # Dashboard components
│   ├── pdf/                      # PDF viewer
│   ├── posts/                    # Posts and comments
│   ├── submissions/              # Submission components
│   └── ui/                       # shadcn/ui components
├── contexts/                     # React contexts
│   └── auth-context.tsx          # Authentication state
├── lib/                          # Utilities
│   ├── api-client.ts             # API client
│   ├── types.ts                  # TypeScript types
│   └── utils.ts                  # Helper functions
├── backend/                      # Express server
│   ├── controllers/              # Route controllers
│   ├── middleware/               # Express middleware
│   ├── routes/                   # API routes
│   ├── services/                 # Business logic
│   ├── utils/                    # Backend utilities
│   └── server.js                 # Server entry point
├── plagiarism-service/           # Python AI service
│   ├── main.py                   # FastAPI server
│   ├── models.py                 # ML models
│   └── requirements.txt          # Python dependencies
└── prisma/                       # Database
    └── schema.prisma             # Database schema
\`\`\`

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- PostgreSQL database
- Redis server
- AWS S3 bucket (for file storage)
- Python 3.9+ (for plagiarism service)

### Environment Variables

Create a `.env` file in the root directory:

\`\`\`env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/classroom"

# JWT
JWT_SECRET="your-secret-key"

# Email (Nodemailer)
EMAIL_HOST="smtp.gmail.com"
EMAIL_PORT=587
EMAIL_USER="your-email@gmail.com"
EMAIL_PASSWORD="your-app-password"
EMAIL_FROM="noreply@classroom.com"

# AWS S3
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
AWS_REGION="us-east-1"
AWS_S3_BUCKET="your-bucket-name"

# Redis
REDIS_HOST="localhost"
REDIS_PORT=6379

# Plagiarism Service
PLAGIARISM_SERVICE_URL="http://localhost:8000"

# Frontend
NEXT_PUBLIC_API_URL="http://localhost:5000/api"
\`\`\`

### Installation

1. **Install dependencies:**
\`\`\`bash
npm install
\`\`\`

2. **Setup database:**
\`\`\`bash
npx prisma generate
npx prisma db push
\`\`\`

3. **Install Python dependencies:**
\`\`\`bash
cd plagiarism-service
pip install -r requirements.txt
\`\`\`

### Running the Application

1. **Start the backend server:**
\`\`\`bash
cd backend
node server.js
\`\`\`

2. **Start the plagiarism service:**
\`\`\`bash
cd plagiarism-service
python main.py
\`\`\`

3. **Start the Next.js development server:**
\`\`\`bash
npm run dev
\`\`\`

4. **Start Redis (if not running as a service):**
\`\`\`bash
redis-server
\`\`\`

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- Plagiarism Service: http://localhost:8000

## Usage

### For Teachers

1. **Register** as a teacher account
2. **Create a class** from the dashboard
3. **Share the join code** with students
4. **Create assignments** with deadlines and point values
5. **Review submissions** and view plagiarism reports
6. **Grade submissions** and provide feedback via comments
7. **Post announcements** to the class

### For Students

1. **Register** as a student account
2. **Join a class** using the teacher's join code
3. **View assignments** and deadlines
4. **Submit work** via text or file upload
5. **View plagiarism reports** on your submissions
6. **Receive feedback** through submission comments
7. **Participate** in class discussions

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/verify-email/:token` - Verify email
- `GET /api/auth/me` - Get current user

### Classes
- `POST /api/classes` - Create class (teacher)
- `GET /api/classes` - Get teacher's classes
- `POST /api/classes/join` - Join class (student)
- `GET /api/classes/enrolled` - Get enrolled classes
- `GET /api/classes/:id` - Get class details
- `DELETE /api/classes/:id/students/:studentId` - Remove student

### Assignments
- `POST /api/assignments/:classId` - Create assignment
- `GET /api/assignments/:id` - Get assignment details
- `GET /api/assignments/:id/submissions` - Get submissions

### Submissions
- `POST /api/submissions/:assignmentId` - Submit assignment
- `GET /api/submissions/:id/highlighted-pdf` - Download highlighted PDF

### Posts & Comments
- `POST /api/posts/:classId` - Create post
- `POST /api/comments/:postId` - Comment on post
- `GET /api/submission-comments/:submissionId` - Get submission comments
- `POST /api/submission-comments/:submissionId` - Add submission comment

## Plagiarism Detection

The plagiarism detection system uses:

1. **Text Embedding**: Converts submission text into vector representations
2. **Similarity Calculation**: Compares embeddings using cosine similarity
3. **AI Detection**: Analyzes writing patterns for AI-generated content
4. **Highlight Generation**: Maps plagiarized sections to PDF coordinates
5. **Report Generation**: Creates detailed reports with metrics

### How It Works

1. Student submits assignment
2. Backend extracts text from submission
3. Text is sent to plagiarism service
4. Service compares against all previous submissions
5. Similarity scores and AI probability calculated
6. Highlights generated for PDF visualization
7. Report stored and displayed to teacher

## Security

- Passwords hashed with bcrypt
- JWT tokens for authentication
- Role-based access control
- File upload validation
- SQL injection prevention via Prisma
- CORS configuration
- Environment variable protection

## Future Enhancements

- Real-time notifications
- Advanced analytics dashboard
- Peer review system
- Assignment templates
- Bulk grading tools
- Mobile app
- Integration with LMS platforms
- Video submission support
- Live class sessions
- Attendance tracking

## Contributing

This is a demonstration project. For production use, consider:

- Adding comprehensive error handling
- Implementing rate limiting
- Adding unit and integration tests
- Setting up CI/CD pipelines
- Implementing proper logging
- Adding monitoring and alerting
- Optimizing database queries
- Implementing caching strategies

## License

MIT License - feel free to use this project for learning and development.

## Support

For issues or questions, please open an issue on the GitHub repository.
