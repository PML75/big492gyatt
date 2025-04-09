// app.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();

// Configure CORS to allow requests from your Chrome extension and localhost.
// Note: Depending on your needs you may wish to refine the CORS settings.
app.use(
  cors({
    credentials: true,
    origin: ["chrome-extension://*", "http://127.0.0.1:*"]
  })
);

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Default Canvas API configuration from environment variables
const DEFAULT_CANVAS_API_URL = process.env.CANVAS_API_URL || "https://canvas.instructure.com";
// Although you might have a default key for development,
// the idea is that each user must supply their own Canvas API key.
const DEFAULT_CANVAS_API_KEY = process.env.CANVAS_API_KEY;

// Serve focus.html on the root URL (make sure focus.html exists in the same directory)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'focus.html'));
});

// Helper function to fetch courses from Canvas API
async function fetchCourses(api_url, api_key) {
  const response = await axios.get(`${api_url}/api/v1/courses`, {
    headers: {
      "Authorization": `Bearer ${api_key}`
    },
    params: {
      "enrollment_state": "active",
      "include[]": "total_students"
    }
  });
  return response.data;
}

// Endpoint to fetch courses from Canvas API.
// Supports both GET (using query parameters) and POST (JSON body).
app.all('/api/courses', async (req, res) => {
  let api_key = DEFAULT_CANVAS_API_KEY;
  let api_url = DEFAULT_CANVAS_API_URL;

  // If the request method is POST and Content-Type is application/json
  if (req.method === 'POST' && req.is('application/json')) {
    try {
      const data = req.body;
      if (data.api_key) {
        // Use the API key and URL from the user request.
        api_key = data.api_key;
        api_url = data.api_url || DEFAULT_CANVAS_API_URL;
        console.log(`Using API key from request: ${api_key.substring(0, 8)}...`);
      } else {
        console.log("No API key provided in request, using default");
      }
    } catch (error) {
      console.error(`Error processing JSON: ${error.message}`);
      return res.status(400).json({ error: `Invalid request: ${error.message}` });
    }
  } else if (req.method === 'GET') {
    // Allow API key via query parameters (e.g., /api/courses?api_key=your_key&api_url=...)
    if (req.query.api_key) {
      api_key = req.query.api_key;
      api_url = req.query.api_url || DEFAULT_CANVAS_API_URL;
      console.log(`Using API key from query: ${api_key.substring(0, 8)}...`);
    } else {
      console.log("No API key provided in query parameters.");
    }
  }

  // Ensure the API key is provided; if not, return an error.
  if (!api_key) {
    return res.status(400).json({ error: "Canvas API key not provided" });
  }

  console.log(`Fetching courses from: ${api_url}`);
  try {
    const courses = await fetchCourses(api_url, api_key);

    // Format courses for the client.
    // Skip courses that have no name or are access restricted by date.
    const formatted_courses = [];
    if (Array.isArray(courses)) {
      courses.forEach((course) => {
        if (!course.name || course.access_restricted_by_date) return;
        formatted_courses.push({
          id: String(course.id),
          name: course.name,
          code: course.course_code || "",
          description: course.course_code || "No description available",
          students: course.total_students || 0
        });
      });
    } else {
      console.warn("Unexpected Canvas API response structure", courses);
    }

    console.log(`Successfully fetched ${formatted_courses.length} courses`);
    return res.json(formatted_courses);
  } catch (error) {
    console.error(`API Error: ${error.message}`);
    if (error.response && error.response.status === 401) {
      return res.status(401).json({ error: "Canvas API access unauthorized. Please check your API key." });
    }
    return res.status(500).json({ error: `Failed to fetch courses: ${error.message}` });
  }
});

// Start the server on the specified port (default to 5000)
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
