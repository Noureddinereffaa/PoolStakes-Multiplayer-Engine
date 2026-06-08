import { ArrowLeft, BookOpen, ShieldCheck, Sparkles, Trophy, Wallet } from 'lucide-react';
import React from 'react';
import { motion } from 'framer-motion';

interface RulesPageProps {
  onNavigateBack: () => void;
  onNavigateDashboard: () => void;
  language: 'en' | 'ar';
  setLanguage: (lang: 'en' | 'ar') => void;
}

export default function RulesPage({ onNavigateBack, onNavigateDashboard, language, setLanguage }: RulesPageProps) {
  const copy = {
    en: {
      pageTitle: '8-Ball Pool Rules & Table Rental',
      subtitle: 'Based on international rules and professional table rental flow, this page explains the match terms before each game.',
      backButton: 'Back to Home',
      dashboardButton: 'Member Dashboard',
      ruleHeading: '8-Ball Core Rules',
      ruleList: [
        'A match begins with the break. If a ball is pocketed on the break, the shooter continues unless a foul occurs.',
        'Once the first valid ball is pocketed, the shooter is assigned solids or stripes.',
        'The cue ball must strike one of your assigned group first, and the 8-ball may only be targeted after clearing your group.',
        'A foul gives the opponent ball-in-hand according to the foul type.',
        'The winner pockets the 8-ball legally after clearing their group of balls.',
      ],
      fairPlayHeading: 'Integrity & Betting Policies',
      fairPlayList: [
        'Stakes are secured through a mock Laravel wallet and reserved before the match starts.',
        'The winner receives the total stake minus a 5% site commission.',
        'Disconnecting or forfeiting mid-match grants the opponent an automatic win.',
        'Matches may only start after reviewing and confirming these rules.',
      ],
      proTipsHeading: 'Professional Play Notes',
      proTipsList: [
        'Plan your shot carefully: consider angles, cue ball speed, and table force.',
        'On a break, if the 8-ball is pocketed and the shot is not legal, it is a foul.',
        'After claiming a group, open the best path for remaining balls and preserve position.',
        'Use visual guidance tools for a more realistic gameplay approach.',
      ],
      rentalHeading: 'Table Rental & Booking',
      rentalSteps: [
        'Choose a room, set the stake, then share the invite code with your opponent or summon an AI opponent.',
        'Table rental reserves each player’s stake in the virtual wallet; funds are only withdrawn once play begins.',
        'Each player has 60 seconds per shot; time penalties grant the opponent the turn with ball placement according to foul rules.',
        'If you leave before the match begins, funds are returned automatically.',
      ],
      prepHeading: 'Pre-Match Preparation',
      prepText: 'Review the rules before opening a challenge room or summoning the bot. This page is the official reference for any disputes about 8-Ball rules on the platform.',
      openDashboard: 'Go to Dashboard',
      languageSwitch: 'العربية',
    },
    ar: {
      pageTitle: 'قواعد لعبة 8-Ball وتأجير الطاولة',
      subtitle: 'اعتماداً على القوانين الدولية ومحاكاة سير عمل تأجير الطاولة الاحترافية، هذه الصفحة توضح البنود الأساسية قبل بدء أي مباراة.',
      backButton: 'العودة إلى الصفحة الرئيسية',
      dashboardButton: 'لوحة الأعضاء',
      ruleHeading: 'القاعدة الأساسية للعبة 8-Ball',
      ruleList: [
        'المباراة تبدأ بكسر الطاولة، وإذا سقطت كرة باستمرار يتطلب متابعة الضربة دون فاول.',
        'عندما يتم إدخال أول كرة صالحة، يتحدد مجموع الكرات الخاص بك: الصلبة أو المخططة.',
        'يجب أن تضرب الكرة البيضاء أولاً كرة من مجموعتك الخاصة، ولا تضرب الكرة 8 أولاً إلا بعد تنظيف مجموعتك.',
        'إذا وقع فاول، ينتقل الدور للخصم ويمنح مكان الكرة البيضاء حسب نوع الفاول.',
        'الفائز هو اللاعب الذي ينهي ترتيب الكرات ثم يُدخل الكرة رقم 8 بطريقة صحيحة.',
      ],
      fairPlayHeading: 'سياسات النزاهة والمراهنات',
      fairPlayList: [
        'يتم تأمين الرهن عبر محفظة افتراضية Laravel، حيث يُخصم مبلغ كل لاعب قبل بدء المباراة.',
        'الفائز يحصل على إجمالي الرهان مطروحاً منه عمولة الموقع 5%.',
        'الانسحاب أو الانقطاع أثناء مباراة قيد اللعب يمنح الخصم الفوز تلقائياً.',
        'لا يمكن بدء مباراة إلا بعد قراءة وتأكيد القواعد الواضحة، وذلك عبر الرجوع إلى هذه الصفحة في أي وقت.',
      ],
      proTipsHeading: 'ملاحظات اللعب الاحترافية',
      proTipsList: [
        'التخطيط للطلقة أمر جوهري: فكّر في تأثير الزوايا، سرعة الكرة البيضاء، وقوة الطاولة.',
        'في حالة الكسر، إذا بُدلت الكرة 8 فأنت أمام فاول. تعاد الكرة 8 إلى موقعها ويتم وضع الكرة البيضاء خلف الخط.',
        'بمجرد تحديد المجموعة، حاول فتح الزاوية الأمثل للكرات المتبقية والحفاظ على الترتيب.',
        'استخدم البوصلة التوجيهية في اللعبة والمساعدة البصرية لجعل اللعب أكثر واقعية.',
      ],
      rentalHeading: 'تأجير الطاولة وأساليب الحجز',
      rentalSteps: [
        'اختر غرفة مباراة، حدد الرهان، ثم شارك رمز الغرفة مع خصمك أو استدعِ الخصم الآلي.',
        'يتم حجز الطاولة بتعليق رهان كل لاعب في المحفظة الافتراضية؛ لا تُسحب الأموال إلا إذا بدأ اللعب فعلياً.',
        'لكل لاعب 60 ثانية لتنفيذ الطلقة؛ مرور الوقت يمنح الخصم الحق في الدور مع وضع الكرة البيضاء حسب قواعد الفاول.',
        'إذا تركت المباراة قبل بدء اللعب، يُعاد المبلغ محلياً إلى حسابك تلقائياً.',
      ],
      prepHeading: 'خطة العمل قبل فتح المباراة',
      prepText: 'تأكد من مراجعة صفحة القواعد قبل إنشاء غرفة تحدي أو استدعاء البوت. هذه الصفحة هي المرجع الرسمي لأي نزاع أو سؤال حول قوانين 8-Ball داخل المنصة.',
      openDashboard: 'الرابط إلى لوحة الأعضاء',
      languageSwitch: 'English',
    },
  };

  const text = copy[language];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      dir={language === 'ar' ? 'rtl' : 'ltr'} 
      className="flex-1 w-full max-w-6xl mx-auto px-4 py-8 sm:py-10"
    >
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
          className="rounded-full border border-slate-800 bg-slate-950/70 px-4 py-2 text-xs uppercase font-bold text-slate-100 hover:border-emerald-500 hover:text-emerald-300 transition"
        >
          {text.languageSwitch}
        </button>
      </div>

      <div className="flex items-center justify-between gap-4 mb-8">
        <div>
          <button
            onClick={onNavigateBack}
            className="inline-flex items-center gap-2 text-slate-300 text-sm font-bold hover:text-emerald-300 transition"
          >
            <ArrowLeft className="w-4 h-4" /> {text.backButton}
          </button>
          <h1 className="mt-4 text-4xl sm:text-5xl font-black text-white">{text.pageTitle}</h1>
          <p className="mt-3 max-w-2xl text-slate-400 text-sm sm:text-base leading-relaxed">{text.subtitle}</p>
        </div>
        <button
          onClick={onNavigateDashboard}
          className="rounded-full bg-emerald-500 px-5 py-3 text-sm font-black uppercase text-slate-950 hover:bg-emerald-400 transition"
        >
          {text.dashboardButton}
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_0.85fr]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <BookOpen className="w-5 h-5 text-emerald-400" />
              <h2 className="text-xl font-bold text-white">{text.ruleHeading}</h2>
            </div>
            <ul className="space-y-3 text-slate-400 text-sm leading-7 list-disc list-inside">
              {text.ruleList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-cyan-400" />
              <h2 className="text-xl font-bold text-white">{text.fairPlayHeading}</h2>
            </div>
            <ul className="space-y-3 text-slate-400 text-sm leading-7 list-disc list-inside">
              {text.fairPlayList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <Trophy className="w-5 h-5 text-yellow-400" />
              <h2 className="text-xl font-bold text-white">{text.proTipsHeading}</h2>
            </div>
            <ul className="space-y-3 text-slate-400 text-sm leading-7 list-disc list-inside">
              {text.proTipsList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <Wallet className="w-5 h-5 text-emerald-400" />
              <h2 className="text-xl font-bold text-white">{text.rentalHeading}</h2>
            </div>
            <ol className="space-y-4 text-slate-400 text-sm leading-7 list-decimal list-inside">
              {text.rentalSteps.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-950/80 p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-pink-400" />
              <h2 className="text-xl font-bold text-white">{text.prepHeading}</h2>
            </div>
            <p className="text-slate-400 text-sm leading-7">{text.prepText}</p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={onNavigateDashboard}
                className="flex-1 rounded-full bg-emerald-500 px-5 py-3 text-sm font-black uppercase text-slate-950 hover:bg-emerald-400 transition"
              >
                {text.openDashboard}
              </button>
            </div>
          </section>
        </div>
      </div>
    </motion.div>
  );
}
