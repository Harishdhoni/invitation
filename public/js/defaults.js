/* =========================================================================
   Sample wedding details, shown until the admin saves real ones to Firestore.
   Every { en, ta } field falls back to English when the Tamil text is empty.
   ========================================================================= */
export const DEFAULT_CONFIG = {
  groomName: { en: "Arjun", ta: "" },
  brideName: { en: "Meera", ta: "" },
  weddingDateTimeISO: "2027-02-12T06:00:00+05:30", // countdown target (Muhurtham start, IST)
  hashtag: "#ArjunWedsMeera",
  curtainVerse: "அன்புற்று அமர்ந்த வழக்கென்ப வையகத்து\nஇன்புற்றார் எய்தும் சிறப்பு.",
  tagline: {
    en: "Two hearts, two families, one beautiful journey. With joy in our hearts, we invite you to bless us as we begin our new life together. ❤️",
    ta: "இரு இதயங்கள், இரு குடும்பங்கள், ஒரு அழகிய பயணம். எங்கள் புதிய வாழ்க்கையைத் தொடங்கும் இந்நன்னாளில், உங்கள் ஆசிகளை வழங்க அன்புடன் அழைக்கிறோம். ❤️"
  },
  heroDateLine: {
    en: "💍 12th February 2027 • Chennai",
    ta: "💍 12 பிப்ரவரி 2027 • சென்னை"
  },
  accommodationText: {
    en: "We're happy to help and guide our outstation guests. Please reach out to our family coordinators below with your travel details or if you need any assistance.",
    ta: "வெளியூர் விருந்தினர்களுக்கு உதவவும் வழிகாட்டவும் மகிழ்ச்சியடைகிறோம். உங்கள் பயண விவரங்களுடன் அல்லது ஏதேனும் உதவி தேவைப்பட்டால், கீழே உள்ள எங்கள் குடும்ப ஒருங்கிணைப்பாளர்களைத் தொடர்பு கொள்ளவும்."
  },
  coordinators: [
    { name: { en: "Family Coordinator", ta: "குடும்ப ஒருங்கிணைப்பாளர்" }, phones: ["+91 90000 00000"] }
  ],
  events: [
    {
      id: "wedding",
      icon: { type: "emoji", emoji: "🪔", imageId: "" },
      name: { en: "Wedding", ta: "திருமணம்" },
      date: { en: "12th February 2027", ta: "12 பிப்ரவரி 2027" },
      time: { en: "6:00 AM to 7:30 AM", ta: "காலை 6:00 முதல் 7:30 வரை" },
      place: { en: "Sri Lakshmi Mahal", ta: "ஸ்ரீ லட்சுமி மஹால்" },
      venue: { en: "Anna Nagar, Chennai - 600040", ta: "அண்ணா நகர், சென்னை - 600040" },
      desc: { en: "The sacred wedding ceremony with traditional rites.", ta: "மரபுச் சடங்குகளுடன் நடைபெறும் புனிதத் திருமண நிகழ்வு." },
      mapQuery: "Anna Nagar Chennai 600040",
      mapUrl: ""
    },
    {
      id: "reception",
      icon: { type: "emoji", emoji: "🎉", imageId: "" },
      name: { en: "Reception", ta: "வரவேற்பு" },
      date: { en: "11th February 2027", ta: "11 பிப்ரவரி 2027" },
      time: { en: "6:30 PM onwards", ta: "மாலை 6:30 மணி முதல்" },
      place: { en: "Sri Lakshmi Mahal", ta: "ஸ்ரீ லட்சுமி மஹால்" },
      venue: { en: "Anna Nagar, Chennai - 600040", ta: "அண்ணா நகர், சென்னை - 600040" },
      desc: { en: "An evening of dinner and celebration with all our loved ones.", ta: "அன்புக்குரிய அனைவருடனும் இரவு விருந்தும் கொண்டாட்டமும்." },
      mapQuery: "Anna Nagar Chennai 600040",
      mapUrl: ""
    }
  ],
  // imageId -> version (timestamp). Filled in by the admin page on upload;
  // "cover" and "deity" fall back to the files in assets/ until then.
  images: {},
  // Background music uploaded from the admin page: { v, chunks, size, type, name }.
  music: null
};

/* ------------------------- UI strings (EN / Tamil) ------------------------- */
export const TRANSLATIONS = {
  en: {
    shareBtn: "⧉ Copy Invite Link",
    curtainTap: "Tap the emblem to open the invitation",
    heroEyebrow: "Together with our families",
    scrollCue: "Scroll",
    eventsEyebrow: "Save The Dates", eventsTitle: "Wedding Events",
    eventsSub: "We would be delighted to have you join us at each of these celebrations.",
    getDirections: "Get Directions",
    countdownEyebrow: "Almost Time", countdownTitle: "Counting Down To Our Muhurtham",
    cdDays: "Days", cdHours: "Hours", cdMins: "Minutes", cdSecs: "Seconds",
    wishesEyebrow: "Guest Book", wishesTitle: "Leave Us Your Wishes",
    wishesSub: "Your blessings mean the world to us — leave a little note below.",
    wishNamePh: "Your name", wishMsgPh: "Write your wishes for the couple...", sendWishes: "Send Wishes 💌",
    showMore: "Show more wishes", noWishes: "Be the first to leave your blessings 💛",
    wishThanks: "Thank you for your wishes! 💛", wishFailed: "Couldn't send right now — please try again.",
    linkCopied: "Invitation link copied 🔗", linkCopyFailed: "Copy this page's URL to share it",
    musicBlocked: "Tap the music button 🎵 to start the background track",
    musicLoading: "Music is loading — one moment 🎵",
    stayEyebrow: "For Our Guests", stayTitle: "Help & Support", coordinatorsLabel: "Coordinators",
    footerThanks: "With gratitude and love, we thank you for being part of our story.",
    musicHint: "Toggle background music"
  },
  ta: {
    shareBtn: "⧉ இணைப்பை நகலெடு",
    curtainTap: "அழைப்பிதழைத் திறக்க சின்னத்தைத் தொடவும்",
    heroEyebrow: "எங்கள் குடும்பத்தினருடன் இணைந்து",
    scrollCue: "கீழே செல்ல",
    eventsEyebrow: "நிகழ்வு தேதிகள்", eventsTitle: "திருமண நிகழ்வுகள்",
    eventsSub: "இந்த ஒவ்வொரு விழாவிலும் நீங்கள் எங்களுடன் கலந்துகொண்டால் பெருமகிழ்ச்சி அடைவோம்.",
    getDirections: "வழி காட்டு",
    countdownEyebrow: "நேரம் நெருங்குகிறது", countdownTitle: "எங்கள் முகூர்த்தத்திற்கான நாள் எண்ணிக்கை",
    cdDays: "நாட்கள்", cdHours: "மணி", cdMins: "நிமிடம்", cdSecs: "வினாடி",
    wishesEyebrow: "வாழ்த்துப் புத்தகம்", wishesTitle: "உங்கள் வாழ்த்துகளைப் பகிருங்கள்",
    wishesSub: "உங்கள் ஆசிகள் எங்களுக்கு மிகவும் விலைமதிப்பற்றவை — கீழே ஒரு சிறு குறிப்பை எழுதுங்கள்.",
    wishNamePh: "உங்கள் பெயர்", wishMsgPh: "மணமக்களுக்கு உங்கள் வாழ்த்துகளை எழுதுங்கள்...", sendWishes: "வாழ்த்து அனுப்பு 💌",
    showMore: "மேலும் வாழ்த்துகள்", noWishes: "முதல் வாழ்த்தை நீங்களே பதிவு செய்யுங்கள் 💛",
    wishThanks: "உங்கள் வாழ்த்துகளுக்கு நன்றி! 💛", wishFailed: "இப்போது அனுப்ப முடியவில்லை — மீண்டும் முயற்சிக்கவும்.",
    linkCopied: "அழைப்பிதழ் இணைப்பு நகலெடுக்கப்பட்டது 🔗", linkCopyFailed: "பகிர இந்தப் பக்கத்தின் முகவரியை நகலெடுக்கவும்",
    musicBlocked: "பின்னணி இசையைத் தொடங்க 🎵 பொத்தானைத் தொடவும்",
    musicLoading: "இசை ஏற்றப்படுகிறது — சற்று பொறுக்கவும் 🎵",
    stayEyebrow: "விருந்தினர்களுக்காக", stayTitle: "உதவி மற்றும் ஆதரவு", coordinatorsLabel: "தொடர்புக்கு",
    footerThanks: "எங்கள் வாழ்க்கைப் பயணத்தின் ஒரு பகுதியாக இருப்பதற்கு அன்புடனும் நன்றியுடனும்.",
    musicHint: "பின்னணி இசை"
  }
};

/* -------------------------------- helpers -------------------------------- */
export const clone = o => JSON.parse(JSON.stringify(o));

// Pick the text for a language from a plain string or an { en, ta } object.
export function tr(field, lang){
  if(field && typeof field === "object"){
    const v = (field[lang] || "").trim();
    return v || field.en || "";
  }
  return field || "";
}

// Fill any keys missing from a saved config with the defaults, so older or
// partial documents never break rendering.
export function withDefaults(saved){
  return { ...clone(DEFAULT_CONFIG), ...(saved || {}) };
}

export const newId = () => Math.random().toString(36).slice(2, 10);
