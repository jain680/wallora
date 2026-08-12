# Wallora - AI-Powered Interior Design Assistant

Wallora is a production-ready web application that helps users transform their rooms with AI-powered paint, wallpaper, and decor suggestions. Upload a room image and receive professional design recommendations without hiring an interior designer.

## Features

- 🎨 **AI-Powered Analysis**: Uses OpenAI Vision API to analyze room images
- 🖼️ **Paint Color Suggestions**: Get personalized paint color recommendations
- ✨ **Wallpaper & Texture Ideas**: Discover patterns and textures for your space
- 🪴 **Decor Recommendations**: Receive minimal decor suggestions
- 🏭 **Brand Recommendations**: Get paint brand suggestions for Indian markets
- 📱 **AR Paint Preview**: Preview paint colors in your room using WebXR AR (mobile)
- 🎯 **Canvas Fallback**: Paint overlay on images when AR is not supported
- 📱 **Responsive Design**: Works seamlessly on desktop and mobile devices
- ⚡ **Fast & Modern**: Built with Next.js 14 and Tailwind CSS

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, TypeScript
- **Styling**: Tailwind CSS
- **AI**: OpenAI GPT-4 Vision API
- **AR/3D**: Three.js, WebXR API
- **Image Handling**: Base64 encoding (local storage)
- **State Management**: React Hooks

## Prerequisites

- Node.js 18+ and npm/yarn
- OpenAI API key ([Get one here](https://platform.openai.com/api-keys))

## Installation

1. **Clone or navigate to the project directory**

```bash
cd "AI paint"
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

Create a `.env.local` file in the root directory:

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and add your OpenAI API key:

```env
OPENAI_API_KEY=your_openai_api_key_here

# Optional: Specify a different OpenAI model
# OPENAI_MODEL=gpt-4o

# Demo Mode: Set to 'true' to use mock data instead of OpenAI API
# Useful for testing without API credits
# USE_DEMO_MODE=true
```

**Note**: The default model is `gpt-4o`. If you don't have access to this model, you can use:
- `gpt-4-turbo` (if available)
- `gpt-4-vision-preview` (legacy)

4. **Run the development server**

```bash
npm run dev
```

5. **Open your browser**

Navigate to [http://localhost:3000](http://localhost:3000)

## Project Structure

```
wallora/
├── app/
│   ├── api/
│   │   └── analyze/
│   │       └── route.ts          # OpenAI API integration
│   ├── about/
│   │   └── page.tsx              # How It Works page
│   ├── upload/
│   │   └── page.tsx              # Image upload page
│   ├── suggestions/
│   │   └── page.tsx              # Design suggestions results
│   ├── layout.tsx                # Root layout with navigation
│   ├── page.tsx                  # Landing page
│   └── globals.css               # Global styles
├── components/
│   ├── ImageUpload.tsx           # Image upload component
│   ├── LoadingSpinner.tsx        # Loading state component
│   └── ResultCard.tsx            # Result display component
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── README.md
```

## Usage

1. **Landing Page**: Start at the homepage to learn about Wallora
2. **Upload Room**: Click "Upload Your Room" and select a room image (JPG/PNG)
3. **Generate**: Click "Generate Design Suggestions" to analyze your room
4. **View Results**: Review AI-generated suggestions for:
   - Room analysis
   - Paint colors
   - Accent wall advice
   - Wallpaper suggestions
   - Decor ideas
   - Paint brand recommendations
   - Designer's verdict
5. **AR Preview**: Click "View Paint in My Room (AR)" to preview paint colors:
   - On mobile: Uses WebXR AR to overlay paint on your real room
   - On desktop/unsupported: Shows paint overlay on uploaded image
   - Adjust colors, opacity, and toggle paint visibility

## API Endpoints

### POST `/api/analyze`

Analyzes a room image and returns design suggestions.

**Request Body:**
```json
{
  "image": "base64_encoded_image_string",
  "mimeType": "image/jpeg"
}
```

**Response:**
```json
{
  "roomAnalysis": "...",
  "paintColors": "...",
  "accentWall": "...",
  "wallpaper": "...",
  "decor": "...",
  "paintBrands": "...",
  "verdict": "..."
}
```

## Building for Production

```bash
npm run build
npm start
```

### Segmentation Backend (Required for AR & Interactive Painting)

The interactive painting feature requires a Python backend running the Segment Anything Model (SAM).

1. **Navigate to the backend directory**:
   ```bash
   cd backend-segmentation
   ```

2. **Set up a virtual environment** (optional but recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: .\venv\Scripts\activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the backend**:
   ```bash
   python segmentation_api.py
   ```
   The backend will start on `http://localhost:5000`.

*Required unless `USE_DEMO_MODE=true` is set (though demo mode currently only affects analysis, not segmentation).


## Tips for Best Results

- Use good lighting when taking room photos
- Capture the entire room including walls and furniture
- Upload high-resolution images (JPG or PNG)
- Ensure images are clear and not blurry

## Troubleshooting

### "OpenAI API key not configured"
- Make sure you've created `.env.local` with your `OPENAI_API_KEY`
- Restart the development server after adding environment variables

### "Failed to analyze image"
- Check that your OpenAI API key is valid
- Ensure you have credits/quota in your OpenAI account
- Verify the image format is JPG or PNG
- **Tip**: If you're out of credits, enable demo mode by setting `USE_DEMO_MODE=true` in `.env.local` to test the app with mock data

### Model not found errors
- Try setting `OPENAI_MODEL=gpt-4-turbo` in `.env.local`
- Or use `gpt-4-vision-preview` if available

### AR Preview not working
- Ensure you're using HTTPS (required for WebXR)
- Check if your device/browser supports WebXR AR
- Try the fallback mode which works on all devices
- On mobile, allow camera permissions when prompted

## AR Preview Feature

The AR preview feature allows users to visualize paint colors in their room:

- **WebXR AR Mode**: On supported mobile devices, uses WebXR to overlay a virtual wall plane in AR space
- **Canvas Fallback**: On unsupported devices, overlays paint color on the uploaded room image
- **Controls**: 
  - Color picker with preset colors and custom color selection
  - Opacity slider (0-100%)
  - Toggle to show/hide paint overlay
  - Reset to default settings

**Browser Support**:
- WebXR AR: Chrome/Edge on Android (ARCore), Safari on iOS (ARKit) - requires HTTPS
- Fallback mode: All modern browsers

## Future Enhancements (Not in v1)

- User authentication
- Payment integration
- AI-based wall segmentation for precise wall detection in AR
- VR walkthrough
- Admin panel
- Cloudinary integration for image storage
- Save design history

## License

This project is open source and available for personal and commercial use.

## Support

For issues or questions, please check the code comments or refer to the Next.js and OpenAI documentation.

---

Built with ❤️ using Next.js and OpenAI
