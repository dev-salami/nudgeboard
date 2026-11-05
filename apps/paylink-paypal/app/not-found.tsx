import Link from "next/link";

export default function NotFound() {
  return (
    <div className="pay-shell bg-bg">
      <div className="paper pay-card p-8 text-center">
        <p className="t-micro text-muted">Missing</p>
        <h1 className="mt-3 text-3xl">That page is not in the books.</h1>
        <Link href="/" className="btn btn-primary mt-6">Home</Link>
      </div>
    </div>
  );
}
