export default function About() {
  return (
    <div className="min-h-screen max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-4xl font-bold text-warm-800 mb-8 text-center">
        How Wallora Works
      </h1>
      
      <div className="space-y-8">
        <section className="card">
          <h2 className="text-2xl font-semibold text-warm-800 mb-4">
            About Wallora
          </h2>
          <p className="text-warm-600 leading-relaxed">
            Wallora is an AI-powered interior design assistant that helps you transform your living spaces 
            without the need for expensive interior designers. Using advanced computer vision and language 
            models, Wallora analyzes your room photos and provides professional-grade suggestions for paint 
            colors, wallpapers, textures, and decor.
          </p>
        </section>

        <section className="card">
          <h2 className="text-2xl font-semibold text-warm-800 mb-4">
            How It Works
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold text-warm-700 mb-2">1. Upload Your Room Photo</h3>
              <p className="text-warm-600">
                Simply upload a clear photo of the room you want to redesign. The image should show the 
                walls, lighting, and existing furniture for best results.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-warm-700 mb-2">2. AI Analysis</h3>
              <p className="text-warm-600">
                Our AI analyzes your room's architecture, lighting conditions, existing color scheme, 
                and furniture style to understand the space's character and needs.
              </p>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-warm-700 mb-2">3. Get Professional Suggestions</h3>
              <p className="text-warm-600">
                Receive comprehensive design recommendations including:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-warm-600 ml-4">
                <li>Paint color palettes matched to your room</li>
                <li>Accent wall placement suggestions</li>
                <li>Wallpaper and texture recommendations</li>
                <li>Minimal decor ideas</li>
                <li>Paint brand recommendations</li>
                <li>Professional designer verdict</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="text-2xl font-semibold text-warm-800 mb-4">
            Why Wallora?
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-warm-700 mb-2">💰 Budget-Friendly</h3>
              <p className="text-warm-600 text-sm">
                Get professional design advice without hiring an expensive interior designer.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-warm-700 mb-2">⚡ Instant Results</h3>
              <p className="text-warm-600 text-sm">
                Receive design suggestions in seconds, not days or weeks.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-warm-700 mb-2">🏠 Indian Home Focused</h3>
              <p className="text-warm-600 text-sm">
                Suggestions tailored for Indian homes, climate, and design preferences.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-warm-700 mb-2">🎨 Professional Quality</h3>
              <p className="text-warm-600 text-sm">
                AI trained on professional interior design principles and trends.
              </p>
            </div>
          </div>
        </section>

        <section className="card">
          <h2 className="text-2xl font-semibold text-warm-800 mb-4">
            Tips for Best Results
          </h2>
          <ul className="space-y-2 text-warm-600">
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Use good lighting when taking photos</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Capture the entire room, including walls and furniture</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Upload high-resolution images (JPG or PNG)</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>Ensure the image is clear and not blurry</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  )
}
