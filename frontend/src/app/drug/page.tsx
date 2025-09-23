"use client";

export default function DrugPage() {
  return (
    <main className="container">
      <h1 className="title">Drug Info</h1>
      <p className="content">Drug info will go here.</p>

      <style jsx>{`
        .container {
          background: #f5f6fa;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 2rem;
        }

        .title {
          color: #7BAFD4; /* UNC blue */
          font-size: 2.5rem;
          font-weight: 800;
          text-align: center;
          margin-bottom: 1.5rem;
        }

        .content {
          font-size: 1.2rem;
          color: #333;
        }
      `}</style>
    </main>
  );
}
