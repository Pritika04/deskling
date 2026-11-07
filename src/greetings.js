'use strict';
const messages = {
  morning: ['Have an awesome day. I’ll be right here.', 'Morning, sunshine. Let’s take today gently.', 'A fresh morning and a little company for you.'],
  afternoon: ['Enjoy your afternoon. You’ve earned a little breather.', 'A little afternoon pause? I’ll keep you company.', 'Hope the rest of your afternoon feels lovely.'],
  evening: ['Enjoy your evening. You’ve done well today.', 'Cozy evening mode: on.', 'Feet up. You’ve earned a breather.', 'Hope your evening feels lovely.', 'A little rest, a little company.', 'Let’s settle in for a cozy evening.', 'Evening plans: rest and good company.', 'You did a good thing for yourself today.'],
  night: ['Zzz… I’m getting a little sleepy. Time to take it gently.', 'It’s getting late. A little rest sounds lovely.', 'Sleepy eyes over here. Hope you have a peaceful night.'],
};
function chooseGreeting(now = new Date(), previous = '', random = Math.random) {
  const hour = now.getHours();
  const period = hour < 6 || hour >= 22 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const choices = messages[period].filter(text => text !== previous);
  return { period, text: choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))] };
}
const giftSize = size => Math.min(192, Math.round(size * 1.2));
const encouragements = ['Keep it strong!', 'Keep it going!', 'Woohoo!', 'Way to go!', 'Look at you go!', 'Every little bit counts.', 'You’re making lovely progress!'];
function chooseEncouragement(previous = '', random = Math.random) {
  const choices = encouragements.filter(text => text !== previous);
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
}
module.exports = { chooseGreeting, giftSize, chooseEncouragement, encouragements };
