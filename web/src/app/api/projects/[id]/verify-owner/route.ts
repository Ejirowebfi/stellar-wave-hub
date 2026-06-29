import { Keypair, TransactionBuilder, Networks } from "@stellar/stellar-sdk";
import firestore from "@/lib/firebase";
import { projectsCol } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
export const dynamic = "force-dynamic";

// Reuses the auth challenge collection used by /api/auth/challenge + /api/auth/wallet
function challengesCol() { return firestore.collection("auth_challenges"); }

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getAuthUser(request);
  if (!auth) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const ref = projectsCol.ref.doc(id);
  const doc = await ref.get();
  if (!doc.exists) return Response.json({ error: "Project not found" }, { status: 404 });

  const project = doc.data()!;
  if (project.user_id !== auth.userId && auth.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const publicKey = project.stellar_account_id as string | undefined;
  if (!publicKey) {
    return Response.json({ error: "Project has no Stellar account to verify" }, { status: 400 });
  }

  try {
    const { signedXdr } = await request.json();
    if (!signedXdr) {
      return Response.json({ error: "signedXdr is required" }, { status: 400 });
    }

    // Retrieve and validate challenge (issued by /api/auth/challenge for this account)
    const challengeDoc = await challengesCol().doc(publicKey).get();
    if (!challengeDoc.exists) {
      return Response.json({ error: "No challenge found. Request a new one." }, { status: 400 });
    }

    const challengeData = challengeDoc.data()!;
    if (Date.now() > (challengeData.expires_at as number)) {
      await challengesCol().doc(publicKey).delete();
      return Response.json({ error: "Challenge expired. Request a new one." }, { status: 400 });
    }

    // Parse the signed transaction and verify the project account's signature
    const transaction = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
    const keypair = Keypair.fromPublicKey(publicKey);
    const txHash = transaction.hash();

    const signedByOwner = transaction.signatures.some((sig) => {
      try {
        return keypair.verify(txHash, sig.signature());
      } catch {
        return false;
      }
    });

    if (!signedByOwner) {
      return Response.json(
        { error: "Invalid signature — challenge not signed by the project's Stellar account" },
        { status: 401 }
      );
    }

    // Clean up used challenge and persist the verified flag
    await challengesCol().doc(publicKey).delete();
    await ref.update({
      owner_verified: true,
      owner_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return Response.json({ verified: true });
  } catch (err) {
    console.error("Verify owner error:", err);
    return Response.json({ error: "Verification failed" }, { status: 500 });
  }
}
