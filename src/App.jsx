import React from "react";
import Chatbot from "./components/chatbot";

function App() {
  return (
    <main className="h-screen overflow-hidden bg-stone-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl text-center mb-6">
        <h1 className="text-3xl font-serif text-stone-900 tracking-wide">
          Atelier Réne
        </h1>
        <p className="text-stone-600 text-sm mt-1">
          Custom Formal & Luxury Wear Client Assistant
        </p>
      </div>

      {/* Render the chatbot */}
      <Chatbot />
    </main>
  );
}

export default App;
