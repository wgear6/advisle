"use client"

import { useState } from "react"

export default function Home() {
  const [file, setFile] = useState<File | null>(null)

  async function uploadFile() {
    if (!file) {
      alert("Please upload a PDF first")
      return
    }

    const formData = new FormData()
    formData.append("file", file)

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData
    })

    const data = await res.json()
    alert(data.message)
  }

  return (
    <main style={{ padding: 40 }}>
      <h1>AI Degree Scheduler</h1>

      <p>Upload your degree audit PDF</p>

      <input
        type="file"
        accept=".pdf"
        onChange={(e) => {
          if (e.target.files) {
            setFile(e.target.files[0])
          }
        }}
      />

      <br /><br />

      <button onClick={uploadFile}>
        Generate Schedule
      </button>
    </main>
  )
}
