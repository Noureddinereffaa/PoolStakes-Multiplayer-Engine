export type Lang = 'en' | 'ar';

export type AppKey =
  | 'home'
  | 'rules'
  | 'dashboard'
  | 'signOut'
  | 'secureChannel'
  | 'loginGreeting'
  | 'activeMatch'
  | 'prizePool'
  | 'stakeEach'
  | 'quitArena'
  | 'copyRoomCode'
  | 'summonBot'
  | 'bankLabel'
  | 'langSwitch'
  | 'landingTag'
  | 'landingHeroTitleLine1'
  | 'landingHeroTitleLine2'
  | 'landingHeroDescription'
  | 'landingFeature1Title'
  | 'landingFeature1Text'
  | 'landingFeature2Title'
  | 'landingFeature2Text'
  | 'landingFeature3Title'
  | 'landingFeature3Text'
  | 'landingFeature4Title'
  | 'landingFeature4Text'
  | 'landingHallTitle'
  | 'landingHallSubtitle'
  | 'landingBonusBadge'
  | 'landingBonusText'
  | 'landingLoginTab'
  | 'landingRegisterTab'
  | 'landingLoginLabel'
  | 'landingPasswordLabel'
  | 'landingDefaultSeedHint'
  | 'landingLoginButton'
  | 'landingUsernameLabel'
  | 'landingEmailLabel'
  | 'landingAccessPasswordLabel'
  | 'landingWalletLabel'
  | 'landingWalletHint'
  | 'landingRegisterButton'
  | 'landingOrPractice'
  | 'landingGuestButton'
  | 'activeMatchArenaChatTitle'
  | 'activeMatchChatSecure'
  | 'waitingForOpponentSeat'
  | 'waitingForOpponentText'
  | 'secureEscrowActive'
  | 'audited'
  | 'stakesTotalLocked'
  | 'netToWinner'
  | 'matchIntegritySignature'
  | 'roomInviteCopyButton'
  | 'summonPracticeBot'
  | 'enterFreeBot'
  | 'botAggressionIndex'
  | 'hostMultiplayerStakes'
  | 'hostMultiplayerSubtitle'
  | 'roomAccessCode'
  | 'dynamicStakePerCueist'
  | 'customStakeLabel'
  | 'sitHostTable'
  | 'riskFreeBotTraining'
  | 'riskFreeBotSubtitle'
  | 'enterFreeBotPractice'
  | 'apiAuditStreamTitle'
  | 'noApiLogs'
  | 'matchTransactionLedgerTitle'
  | 'noCompletedMatches'
  | 'matchTotal'
  | 'totalCommissions'
  | 'totalPrizes'
  | 'ledgerStatusFlag'
  | 'prizePaid'
  | 'commission'
  | 'commissionPercent'
  | 'beat'
  | 'room'
  | 'timestamp'
  ;

export const dict: Record<Lang, Record<AppKey, string>> = {
  en: {
    home: 'Home',
    rules: 'Rules',
    dashboard: 'Dashboard',
    signOut: 'Sign Out',
    secureChannel: 'SECURE CHANNELS SECURED',
    loginGreeting: 'Secure channels secured',
    activeMatch: 'ACTIVE MULTIPLAYER MATCHUP',
    prizePool: 'TOTAL PRIZE POOL',
    stakeEach: 'STAKE EACH CUEIST',
    quitArena: 'Surrender & Quit Arena',
    copyRoomCode: 'Copy Invite Code',
    summonBot: 'Summon Practice Bot',
    bankLabel: 'USDT',
    langSwitch: 'EN',

    landingTag: 'Standardized Decentralized PvP Payout Arena',
    landingHeroTitleLine1: 'THE ULTIMATE CRYPTO',
    landingHeroTitleLine2: '8-BALL COMBAT ARENA',
    landingHeroDescription:
      'Leverage your billiard angles with high stakes. Lock standard USDT wagers, dominate the authoritative real-time felt, and cashout high-octane peer payouts in 60 seconds!',
    landingFeature1Title: 'PVP Matchmaker',
    landingFeature1Text:
      'Face global billiard sharks across custom stakes from 5 USDT to 1,000 USDT. Absolute winner-takes-all mechanics.',
    landingFeature2Title: 'Free Bot Duel',
    landingFeature2Text:
      'No funds at risk? Fine. Duel our highly calibrated physics bot at 0 cost. Develop precise angle trajectories anytime!',
    landingFeature3Title: 'Instant TRC20 Gate',
    landingFeature3Text:
      'Seamless deposit and withdrawal checkout simulator. Enter your crypto TRC20 layout and cash out automatically!',
    landingFeature4Title: 'Audit Ledgers',
    landingFeature4Text:
      'Verify each payout through live cryptographic hashes. Audited in-depth logs showcase real-time transaction signatures.',

    landingHallTitle: 'HALL OF CHAMPION HIGH-ROLLERS',
    landingHallSubtitle: 'Real-time leaderboard payouts of registered billiard members. Your performance determines your bankroll rank!',
    landingBonusBadge: 'PROMOTIONAL BONUS ON SIGNUP:',
    landingBonusText:
      'Register an original wallet key today and receive $500.00 USDT Credit welcomed immediately into your betting wallet!',

    landingLoginTab: 'ACCESS LOUNGE (Login)',
    landingRegisterTab: 'CREATE WALLET (Register)',
    landingLoginLabel: 'Username / Registered Email:',
    landingPasswordLabel: 'Account Security Pin (Password):',
    landingDefaultSeedHint: "Default password for seeds is '123456'",
    landingLoginButton: 'Enter Betting Club',

    landingUsernameLabel: 'Username:',
    landingEmailLabel: 'Contact Email:',
    landingAccessPasswordLabel: 'Access Password:',
    landingWalletLabel: 'Receiving USDT TRC20 Wallet (For cashouts):',
    landingWalletHint:
      'Required for fast withdrawals. Non-crypto players can also use card checkout inside dashboard.',
    landingRegisterButton: 'Register & Claim 500 USDT',

    landingOrPractice: 'OR PRACTICE WITHOUT RISK',
    landingGuestButton: '🚀 Play instantly as guest (No signup needed)',

    activeMatchArenaChatTitle: 'Arena Chatbox',
    activeMatchChatSecure: 'Secure Peer Channel',
    waitingForOpponentSeat: 'WAITING FOR OPPONENT TO SEAT',
    waitingForOpponentText:
      'Wager match hosted. Share the Access Code for other players to sit or trigger active Bot opponent instead.',
    secureEscrowActive: 'Secure Escrow Active',
    audited: 'Audited',
    stakesTotalLocked: 'STAKES TOTAL LOCKED',
    netToWinner: 'NET TO WINNER (95%)',
    matchIntegritySignature: 'SHA256 Match Integrity Signature:',
    roomInviteCopyButton: 'Copy Invite Code',
    summonPracticeBot: 'Summon Practice Bot',
    enterFreeBot: 'Enter Free Bot Practice Arena (0 USDT)',

    botAggressionIndex: 'Choose Bot Aggression Index (Difficulty):',

    hostMultiplayerStakes: '⚔️ HOST MULTIPLAYER STAKES MATCH',
    hostMultiplayerSubtitle:
      'Host a real pool table, specify standard USDT staking size and link together to battle with global friends peer-to-peer!',
    roomAccessCode: 'Configure Room Access Code ID:',
    dynamicStakePerCueist: 'Dynamic Match Stake per Cueist:',
    customStakeLabel: 'Input Custom Stake Wager Amount (USDT):',
    sitHostTable: 'Sit and Host Stakes Table Room',

    riskFreeBotTraining: '🤖 RISK-FREE BOT TRAINING DUELS (FREE)',
    riskFreeBotSubtitle:
      'Sharpen your curves, practice cue spin, and analyze rebound paths against our high-precision robotic cueist. Absolutely zero wagers required!',
    enterFreeBotPractice: 'Enter Free Bot Practice Arena (0 USDT)',

    apiAuditStreamTitle: 'LARES CRYPTOGRAPHIC AUDIT STREAM',
    noApiLogs: 'No Laravel active endpoints registered yet. Host rooms or run wallet deposits above to audit checkout API.',

    matchTransactionLedgerTitle: 'LARAVEL-DATABASE MATCH TRANSACTION LEDGER',
    noCompletedMatches: 'No completed matches in database. Shoot the 8-ball into a pocket legally to trigger payouts!',
    matchTotal: 'Match Total',
    totalCommissions: 'TOTAL COMMISSIONS TO SITE',
    totalPrizes: 'TOTAL PAID OUT PRIZES',
    ledgerStatusFlag: 'LEDGER STATUS FLAG',

    prizePaid: 'Prize Paid:',
    commission: 'Commission:',
    commissionPercent: '(5%)',
    beat: 'beat',
    room: 'Room:',
    timestamp: 'Timestamp:',
  },
  ar: {
    home: 'الرئيسية',
    rules: 'القواعد',
    dashboard: 'لوحة الأعضاء',
    signOut: 'تسجيل خروج',
    secureChannel: 'القنوات الآمنة مؤمنة',
    loginGreeting: 'القنوات الآمنة مؤمنة',
    activeMatch: 'المباراة متعددة اللاعبين النشطة',
    prizePool: 'إجمالي جائزة الرهان',
    stakeEach: 'رهان لكل لاعب',
    quitArena: 'استسلام وترك الساحة',
    copyRoomCode: 'نسخ رمز الغرفة',
    summonBot: 'استدعاء بوت تدريب',
    bankLabel: 'USDT',
    langSwitch: 'AR',

    landingTag: 'ساحة مراهنات لا مركزية قياسية مع نظام مكافآت',
    landingHeroTitleLine1: 'THE ULTIMATE CRYPTO',
    landingHeroTitleLine2: '8-BALL COMBAT ARENA',
    landingHeroDescription:
      'استفد من زوايا البلياردو مع رهان مرتفع. ثبّت رهان USDT القياسي، وسيطر على واقع اللعب الفعلي بزمن فوري، ثم استلم أرباح الخصوم خلال 60 ثانية!',

    landingFeature1Title: 'مُطابِق مباريات PvP',
    landingFeature1Text:
      'واجه خبراء البلياردو حول العالم عبر رهانات مخصصة من 5 USDT إلى 1,000 USDT. آلية الفوز للجميع بلا استثناء.',
    landingFeature2Title: 'دُويل بوت مجاني',
    landingFeature2Text:
      'هل لا تريد تعريض أموال؟ ممتاز. تنافس مع بوت فيزيائي دقيق مجاناً. طور مسارات زواياك في أي وقت!',
    landingFeature3Title: 'بوابة TRC20 فورية',
    landingFeature3Text:
      'محاكي سهل لإيداع وسحب USDT. أدخل إعدادات TRC20 الخاصة بك واستلم أرباحك تلقائياً!',
    landingFeature4Title: 'سجلات التدقيق',
    landingFeature4Text:
      'تحقق من كل عملية دفع عبر بصمات تشفير حية. سجلات تدقيق مُفصّلة تعرض توقيعات المعاملات الفورية.',

    landingHallTitle: 'قاعة نخبة أفضل اللاعبين (High-Rollers)',
    landingHallSubtitle: 'دفع أرباح الترتيب المباشر للأعضاء المسجلين. أداؤك يحدد ترتيب أموالك!',
    landingBonusBadge: 'مكافأة ترويجية عند التسجيل:',
    landingBonusText:
      'سجّل مفتاح محفظة أصلي اليوم واستلم رصيد $500.00 USDT مباشرة داخل محفظة المراهنة الخاصة بك!',

    landingLoginTab: 'ACCESS LOUNGE (تسجيل الدخول)',
    landingRegisterTab: 'CREATE WALLET (إنشاء حساب)',
    landingLoginLabel: 'اسم المستخدم / البريد المسجل:',
    landingPasswordLabel: 'رمز الأمان (كلمة المرور):',
    landingDefaultSeedHint: "كلمة المرور الافتراضية للبذور هي '123456'",
    landingLoginButton: 'ادخل نادي المراهنة',

    landingUsernameLabel: 'اسم المستخدم:',
    landingEmailLabel: 'البريد الإلكتروني للتواصل:',
    landingAccessPasswordLabel: 'كلمة مرور الوصول:',
    landingWalletLabel: 'المحفظة TRC20 لاستلام الأرباح (لعمليات السحب):',
    landingWalletHint:
      'مطلوب للسحب السريع. يمكن لغير مستخدمي العملات الرقمية استخدام الدفع عبر البطاقة داخل لوحة الأعضاء.',
    landingRegisterButton: 'سجّل واطلب رصيد 500 USDT',

    landingOrPractice: 'أو تدرب بدون أي مخاطر',
    landingGuestButton: '🚀 العب فوراً كزائر (بدون تسجيل)',

    activeMatchArenaChatTitle: 'دردشة ساحة المباراة',
    activeMatchChatSecure: 'قناة آمنة بين اللاعبين',
    waitingForOpponentSeat: 'بانتظار الخصم لكي يجلس',
    waitingForOpponentText:
      'تم استضافة مباراة مراهنة. شارك رمز الغرفة ليتسنى للاعبين الآخرين الجلوس أو لتفعيل خصم البوت بدلاً منهم.',
    secureEscrowActive: 'إيسكرو مؤمّن (Secure Escrow) قيد التشغيل',
    audited: 'مدقق',
    stakesTotalLocked: 'إجمالي الرهانات المحجوزة',
    netToWinner: 'صافي الفوز للفائز (95%)',
    matchIntegritySignature: 'توقيع سلامة المباراة SHA256:',
    roomInviteCopyButton: 'نسخ رمز الغرفة',
    summonPracticeBot: 'استدعاء بوت تدريب',
    enterFreeBot: 'ادخل ساحة تدريب البوت مجاناً (0 USDT)',

    botAggressionIndex: 'اختر مستوى شراسة البوت (الصعوبة):',

    hostMultiplayerStakes: '⚔️ استضافة مباراة مراهنات متعددة اللاعبين',
    hostMultiplayerSubtitle:
      'استضف طاولة حقيقية وحدد حجم رهان USDT ثم اتصل مع خصومك لمواجهة مباشرة (Peer-to-Peer) مع أصدقاء حول العالم!',
    roomAccessCode: 'إعداد رمز وصول الغرفة:',
    dynamicStakePerCueist: 'رهان المباراة لكل لاعب:',
    customStakeLabel: 'أدخل قيمة رهان مخصصة (USDT):',
    sitHostTable: 'اجلس واستضف غرفة رهان',

    riskFreeBotTraining: '🤖 تدريب بوت بدون مخاطر (مجاني)',
    riskFreeBotSubtitle:
      'دقّق منحنياتك وتدرّب على دوران الكرة واختبر مسارات الارتداد ضد روبوت دقيق للغاية. بدون أي رهان نهائياً!',
    enterFreeBotPractice: 'ادخل ساحة تدريب البوت مجاناً (0 USDT)',

    apiAuditStreamTitle: 'سير تدقيق تشفير لارز (LARES)',
    noApiLogs:
      'لم يتم تسجيل أي نقاط نهاية Laravel حالياً. استضف غرفاً أو قم بإجراء إيداعات لمحفظتك لفحص واجهة السحب/الدفع.',

    matchTransactionLedgerTitle: 'سجل معاملات مباريات قاعدة بيانات لارافيل',
    noCompletedMatches: 'لا توجد مباريات مكتملة في قاعدة البيانات. أدخل الكرة 8 بشكل قانوني في جيب لتفعيل المدفوعات!',
    matchTotal: 'إجمالي المباريات',
    totalCommissions: 'إجمالي العمولة للموقع',
    totalPrizes: 'إجمالي الجوائز المدفوعة',
    ledgerStatusFlag: 'علامة حالة السجل',

    prizePaid: 'الرئض المدفوع:',
    commission: 'العمولة:',
    commissionPercent: '(5%)',
    beat: 'يتفوق على',
    room: 'الغرفة:',
    timestamp: 'الوقت:',
  },
};

export function t(lang: Lang, key: AppKey): string {
  return dict[lang][key];
}

