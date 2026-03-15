import * as Linking from 'expo-linking';

const prefix = Linking.createURL('/');

export const linking = {
  prefixes: [prefix, 'sipping://'],
  config: {
    screens: {
      App: {
        screens: {
          HomeTab: {
            screens: {
              JoinTrip: 'join-trip',
            },
          },
        },
      },
      Auth: {
        screens: {
          Login: 'login',
          SignUp: 'signup',
        },
      },
    },
  },
};
