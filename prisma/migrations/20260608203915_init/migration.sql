-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "password" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 500.0,
    "walletAddress" TEXT,
    "guestExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDT',
    "txHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CryptoTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escrow" (
    "id" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "amountEach" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'locked',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "player1Id" TEXT NOT NULL,
    "player2Id" TEXT NOT NULL,

    CONSTRAINT "Escrow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "prize" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "escrowId" TEXT NOT NULL,
    "winnerId" TEXT NOT NULL,
    "loserId" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomSnapshot" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stake" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiLog" (
    "id" TEXT NOT NULL,
    "apiName" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "CryptoTransaction_txHash_key" ON "CryptoTransaction"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_escrowId_key" ON "Transaction"("escrowId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomSnapshot_roomId_key" ON "RoomSnapshot"("roomId");

-- AddForeignKey
ALTER TABLE "CryptoTransaction" ADD CONSTRAINT "CryptoTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escrow" ADD CONSTRAINT "Escrow_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escrow" ADD CONSTRAINT "Escrow_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "Escrow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_loserId_fkey" FOREIGN KEY ("loserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
