FROM materialscloud/tools-barebone:20200124152746970e15

LABEL maintainer="Kevin Maik Jablonka <kevin.jablonka@epfl.ch>"

ADD ./.docker_files/apache-site.conf /etc/apache2/sites-available/app.conf
RUN a2enmod wsgi && a2enmod xsendfile && \
    a2dissite 000-default && a2ensite app

RUN pip3 install --upgrade --no-cache-dir numpy==1.18.4 pymatgen==2020.7.18 scikit-learn==0.22
COPY ./webservice/ webservice
RUN pip3  install --upgrade --no-cache-dir -r /home/app/code/webservice/requirements.txt

RUN chown -R app:app $HOME
