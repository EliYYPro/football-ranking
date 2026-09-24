# Football Ranking App — V1

אפליקציית דירוג כדורגל בעברית, RTL, עם טבלה ציבורית + Admin.

## מה כבר בפנים
- טבלה ציבורית ממוינת אוטומטית לפי נקודות
- תמונת שחקן, ניצחונות ונקודות
- עמוד אישי לכל שחקן + היסטוריית מחזורים
- Admin עם Login
- הוספת שחקן ותמונה
- הזנת 0–3 נקודות לכל שחקן בכל מחזור
- היסטוריית מחזורים
- מחיקת שחקנים
- Demo mode אוטומטי כשאין Supabase
- Responsive למובייל ומחשב

## הפעלה מקומית
1. התקן Node.js.
2. בתיקיית הפרויקט:
   npm install
   npm run dev
3. פתח את הכתובת שמופיעה ב-Terminal.

## חיבור Supabase
1. צור פרויקט חדש ב-Supabase.
2. SQL Editor -> הדבק והריץ את `supabase-schema.sql`.
3. Authentication -> Users -> צור את משתמש ה-Admin שלך עם Email + Password.
4. העתק את UUID של המשתמש.
5. SQL Editor -> הרץ:
   insert into public.admins (user_id) values ('YOUR-USER-UUID');
6. Project Settings / API -> העתק Project URL ואת ה-Publishable key.
7. העתק `.env.example` ל-`.env` והכנס את הערכים.
8. הפעל מחדש `npm run dev`.

## Vercel
- העלה את התיקייה ל-GitHub.
- Import Project ב-Vercel.
- הוסף Environment Variables:
  VITE_SUPABASE_URL
  VITE_SUPABASE_PUBLISHABLE_KEY
- Deploy.

## אבטחה
ה-Publishable key מותר לשימוש בדפדפן; ההרשאות עצמן נאכפות ב-Supabase RLS. לעולם אין להכניס service_role key לקוד Frontend.
Deployment trigger
