// W17 Help and support content. The design's four questions, reworded where the product changed (there is no
// claiming; a worker cannot call the customer before the quote is accepted). The wording is not approved yet:
// the FAQ and the helpline are shown only once DHA enables them (app_settings.helpline_enabled).

export type Faq = { question: string; answer: string };

export function faqs(helpline: string | null): Faq[] {
  const safety = helpline ? ` If it is a safety problem, call the DHA helpline on ${helpline}.` : '';
  return [
    {
      question: 'How do I get paid?',
      answer: 'The customer pays you in cash when the work is done. Then tap Record cash and enter the amount you received.',
    },
    {
      question: 'A customer asks me to change the price',
      answer:
        'If the work really changed, record the different amount and choose a reason. Asking for more than the quote without a reason can get you suspended. If the customer refuses to pay, tap Report a problem.',
    },
    {
      question: 'How is my rating calculated?',
      answer: 'Customers rate each finished job from 1 to 5 stars. Your rating is the average of all your jobs. You do not see who gave which rating.',
    },
    {
      question: 'Can I cancel a job after my quote is accepted?',
      answer: `Open the job and tap Request cancellation. DHA staff review every request, so keep to the plan until they decide.${safety}`,
    },
  ];
}
