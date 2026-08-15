import { QuizConfig } from '../types';

export const defaultQuiz: QuizConfig = {
  title: "Family Summer Quiz",
  password: "123",
  geotagUnlockDistance: 20,
  barnQuestions: [
    {
      id: "b1",
      text: "What color is a banana?",
      options: ["Red", "Blue", "Yellow", "Green"],
      correctAnswers: [2],
      originalLanguage: "en"
    },
    {
      id: "b2",
      text: "Which animal says 'Moooo'?",
      options: ["Horse", "Cow", "Dog", "Cat"],
      correctAnswers: [1],
      originalLanguage: "en"
    },
    {
      id: "b3",
      text: "How many fingers does a human have on one hand?",
      options: ["4", "5", "6", "10"],
      correctAnswers: [1],
      originalLanguage: "en"
    },
    {
      id: "b4",
      type: "text",
      text: "What animal with a long trunk is the largest land mammal?",
      options: [],
      correctAnswers: [],
      correctTextAnswer: "Elephant",
      acceptedTextAnswers: ["Elefant", "An elephant"],
      originalLanguage: "en"
    }
  ],
  vuxenQuestions: [
    {
      id: "v1",
      text: "Which planet is known as the Red Planet?",
      options: ["Venus", "Jupiter", "Mars", "Saturnus"],
      correctAnswers: [2],
      originalLanguage: "en"
    },
    {
      id: "v2",
      text: "Who wrote the novel 'The Trial'?",
      options: ["August Strindberg", "Franz Kafka", "Ernest Hemingway", "Fyodor Dostoevsky"],
      correctAnswers: [1],
      originalLanguage: "en"
    },
    {
      id: "v3",
      text: "What is the capital of Canada?",
      options: ["Toronto", "Vancouver", "Ottawa", "Montreal"],
      correctAnswers: [2],
      originalLanguage: "en"
    },
    {
      id: "v4",
      type: "text",
      text: "What is the capital city of Sweden?",
      options: [],
      correctAnswers: [],
      correctTextAnswer: "Stockholm",
      acceptedTextAnswers: ["Sthlm", "Gamla Stan"],
      originalLanguage: "en"
    }
  ]
};
